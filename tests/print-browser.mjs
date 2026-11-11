// Navegador real, perfil temporário e banco isolado de integration.py.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {loadImage,createCanvas} from '@napi-rs/canvas';
import {decodeQr} from '../public/assets/qr.mjs';
import {readCard} from '../public/assets/omr.mjs';
const chrome=[process.env.MARIOPROVAS_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&fs.existsSync(p));
if(!chrome){console.log('SKIP: Chrome/Edge não encontrado para a verificação real de exportação.');process.exit(0);}
if(!process.env.MARIOPROVAS_TEST_URL||!process.env.MARIOPROVAS_TEST_EXAM)throw Error('Execute por tests/integration.py.');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'marioprovas-browser-')),downloads=path.join(directory,'downloads');fs.mkdirSync(downloads);
const browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${directory}`],{stdio:'ignore',windowsHide:true});
let socket,serial=0;const pending=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async fn=>{for(let i=0;i<200;i++){const result=await fn();if(result)return result;await sleep(50);}throw Error('Prazo de verificação do navegador excedido.');};
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP: ${method} demorou.`));},12000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
try{
    await wait(()=>fs.existsSync(path.join(directory,'DevToolsActivePort')));
    const [port,endpoint]=fs.readFileSync(path.join(directory,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);
    socket=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    socket.onmessage=event=>{const data=JSON.parse(event.data),task=pending.get(data.id);if(task){pending.delete(data.id);clearTimeout(task.timer);if(data.error)task.reject(Error(data.error.message));else task.resolve(data.result);}};
    const {targetId}=await call('Target.createTarget',{url:'about:blank'}),{sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
    const send=(method,params)=>call(method,params,sessionId);
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('JavaScript da página falhou na verificação.');return result.result.value;};
    await send('Page.enable');await send('Runtime.enable');await call('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
    const base=process.env.MARIOPROVAS_TEST_URL;await send('Page.navigate',{url:base});await wait(()=>evaluate('document.readyState === "complete"'));
    const login=await evaluate(`(async()=>{const state=await(await fetch('api.php?action=state')).json();const out=await(await fetch('api.php?action=login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.data.csrf},body:JSON.stringify(${JSON.stringify({email:process.env.MARIOPROVAS_TEST_EMAIL,password:process.env.MARIOPROVAS_TEST_PASSWORD})})})).json();return out.ok;})()`);
    assert.equal(login,true,'sessão de teste no navegador');
    const query=new URLSearchParams({exam:process.env.MARIOPROVAS_TEST_EXAM,sets:process.env.MARIOPROVAS_TEST_SET});
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1050,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:base+'print.html?'+query});await wait(()=>evaluate('document.querySelectorAll(".download-png").length > 0'));
    assert.equal(await evaluate('document.querySelector("#format").value'),'compact');
    assert.equal(await evaluate('document.querySelector(".sheet svg").getAttribute("viewBox")'),'0 0 800 590');
    fs.mkdirSync('tests/artifacts',{recursive:true});
    fs.writeFileSync('tests/artifacts/compacto-tela-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await evaluate('document.querySelector(".download-png").click()');
    const file=await wait(()=>fs.readdirSync(downloads).find(name=>name.endsWith('.png')));const bytes=fs.readFileSync(path.join(downloads,file));
    assert.ok(file.includes('compacto-300dpi.png'));
    const image=await loadImage(bytes),canvas=createCanvas(800,590),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,800,590);
    assert.equal(image.width,Math.round(160/25.4*300));assert.equal(image.height,Math.round(118/25.4*300));
    const index=bytes.indexOf('pHYs');assert.ok(index>0);assert.equal(bytes.readUInt32BE(index+4),11811);
    const pixels=ctx.getImageData(0,0,800,590),jsQR=createRequire(import.meta.url)('../public/assets/vendor/jsQR.js'),qr=decodeQr(pixels,jsQR);assert.ok(qr);
    const reading=readCard(pixels,qr,60,5);assert.equal(reading.layout.format,'compact');assert.equal(reading.blank,60);
    fs.writeFileSync('tests/artifacts/compacto-browser-300dpi.png',bytes);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'sem rolagem horizontal no celular');
    fs.writeFileSync('tests/artifacts/compacto-tela-celular.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await evaluate('document.querySelector("#format").value="a4";document.querySelector("#format").dispatchEvent(new Event("change"))');
    assert.equal(await evaluate('document.querySelector(".sheet svg").getAttribute("viewBox")'),'0 0 800 1120');
    console.log('OK: Chrome real — página compacta, PNG 300 dpi, tamanho físico, QR/60 bolhas em branco, tela desktop/celular sem rolagem horizontal e opção A4. Sem câmera física.');
}finally{
    for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('Navegador encerrado.'));}pending.clear();
    socket?.close();browser.kill();await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else{browser.once('exit',resolve);setTimeout(resolve,3000);}});
    const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('marioprovas-browser-'));
    fs.rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
