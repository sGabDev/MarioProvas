// Navegador real, conta e dados descartáveis criados por bank_integration.py.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {bubblePosition,compactLayout} from '../public/assets/layout.mjs';
import {decodeQr} from '../public/assets/qr.mjs';
import {readCard} from '../public/assets/omr.mjs';
const require=createRequire(import.meta.url);
const jsQR=require('../public/assets/vendor/jsQR.js');
let playwright;
for(const candidate of [process.env.MARIOPROVAS_PLAYWRIGHT,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{playwright=require(candidate);break;}catch{}}
if(!playwright)throw Error('Playwright necessário para conferir a interface (defina MARIOPROVAS_PLAYWRIGHT).');
const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await playwright.chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
const page=await browser.newPage({viewport:{width:1366,height:900},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.MARIOPROVAS_TEST_URL,eid=Number(process.env.MARIOPROVAS_TEST_EXAM);
const go=async(hash,selector)=>{await page.goto(base+'#'+hash);await page.locator(selector).waitFor();};
const api=async(action,data,params={})=>page.evaluate(async({action,data,params})=>{
    const state=await (await fetch('api.php?action=state')).json(),url=new URL('api.php',location.href);url.searchParams.set('action',action);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
    const opts=data?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.data.csrf},body:JSON.stringify(data)}:{};
    const r=await (await fetch(url,opts)).json();if(!r.ok)throw Error(r.error);return r.data;
},{action,data,params});
try{
    await page.goto(base);await page.locator('#email').fill(process.env.MARIOPROVAS_TEST_EMAIL);await page.locator('#password').fill(process.env.MARIOPROVAS_TEST_PASSWORD);await page.locator('#auth button[type=submit]').click();await page.locator('.shell').waitFor();
    await go('bank','#bank-new');await page.locator('#bank-new').click();
    await page.locator('#statement').fill('Questão criada pela interface. Quanto vale 3 + 4?');
    await page.locator('#discipline').fill('Matemática');await page.locator('#area').fill('Exatas');await page.locator('#subject').fill('Adição');
    for(let i=0;i<5;i++)await page.locator(`#option-${i}`).fill(String(i+5));
    await page.locator('#answer').selectOption('C');await page.locator('#bank-editor button[type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
    await page.locator('#bank-search').fill('Questão criada pela interface');await page.locator('#bank-filter button').click();await page.getByText('1 questão(ões) · página 1',{exact:true}).waitFor();
    await page.locator('[data-bank-edit]').click();await page.locator('#statement').fill('Questão editada pela interface. Quanto vale 3 + 4?');await page.locator('#bank-editor button[type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
    await go('compose','#compose');await page.locator('#compose-name').fill('Prova criada pela interface');await page.locator('#compose-count').fill('2');await page.locator('#compose-versions').fill('2');await page.locator('[name=compose-class]').first().check();
    await page.locator('#bank-search').fill('Questão de teste');await page.locator('#compose-search').click();await page.getByText('7 questões disponíveis · página 1',{exact:true}).waitFor();
    await page.locator('[data-choose]').nth(0).check();await page.locator('[data-choose]').nth(1).check();await page.locator('[data-fixed]').first().check();await page.locator('[data-pin][value="4"]').first().check();
    await page.locator('#compose button[type=submit]').click();await page.locator('#compose-preview').waitFor({state:'visible'});assert.equal(await page.locator('#preview-questions .bank-question').count(),2);
    await page.locator('#preview-version').selectOption('B');assert.equal(await page.locator('#preview-questions .bank-question').count(),2);
    // Cadastro durante a montagem preserva os dados, as questões e suas travas.
    await page.locator('#compose-new-question').click();assert.equal(await page.locator('#option-count').inputValue(),'5');assert.ok(await page.locator('#option-count').isDisabled());await page.locator('dialog [data-close]').click();
    assert.ok(await page.locator('#compose-preview').isVisible());assert.equal(await page.locator('#compose-name').inputValue(),'Prova criada pela interface');
    await page.locator('#compose-new-question').click();await page.locator('#statement').fill('Criada durante a montagem: quanto vale 10 + 5?');await page.locator('#discipline').fill('Matemática');await page.locator('#area').fill('Exatas');await page.locator('#subject').fill('Adição');
    for(let i=0;i<5;i++)await page.locator(`#option-${i}`).fill(String(13+i));
    await page.locator('#answer').selectOption('C');await page.locator('#bank-editor button[type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
    await page.locator('.bank-selected').filter({hasText:'Criada durante a montagem'}).waitFor();assert.equal(await page.locator('.bank-selected').count(),3);assert.equal(await page.locator('#compose-count').inputValue(),'3');assert.ok(await page.locator('#compose-preview').isHidden());
    assert.equal(await page.locator('#compose-name').inputValue(),'Prova criada pela interface');assert.equal(await page.locator('#bank-search').inputValue(),'Questão de teste');assert.ok(await page.locator('[name=compose-class]').first().isChecked());assert.ok(await page.locator('[data-fixed]').first().isChecked());assert.ok(await page.locator('[data-pin][value="4"]').first().isChecked());
    const inlineQuestion=(await api('bank_list',undefined,{search:'Criada durante a montagem'})).items[0];assert.equal(inlineQuestion.answer,'C');
    await page.locator('#compose button[type=submit]').click();await page.locator('#compose-preview').waitFor({state:'visible'});assert.equal(await page.locator('#preview-questions .bank-question').count(),3);
    await page.screenshot({path:'tests/artifacts/bank-preview-desktop.png',fullPage:true});
    await page.locator('#finalize-exam').click();await page.locator('#version-panel').waitFor();assert.equal(await page.locator('[data-pdf]').count(),2);
    const inlineExam=await api('exam',undefined,{id:Number(new URL(page.url()).hash.split('/')[1])});assert.ok(inlineExam.questions.some(q=>q.statement===inlineQuestion.statement),'questão criada na montagem deve persistir na prova');
    await page.locator('#pdf-columns').selectOption('2');assert.ok((await page.locator('[data-pdf]').first().getAttribute('href')).endsWith('columns=2'));
    await page.locator('[data-view-version]').nth(1).click();await page.locator('dialog[open] .bank-question').first().waitFor();assert.match(await page.locator('dialog h2').textContent(),/Versão B/);await page.locator('dialog [data-close]').click();
    const dl=page.waitForEvent('download');await page.locator('[data-pdf]').first().click();const download=await dl;assert.ok(download.suggestedFilename().endsWith('.pdf'));
    await download.saveAs('tests/artifacts/bank-ui-prova.pdf');
    // Exercita PNG real da versão B: QR e bolhas vêm do arquivo exportado.
    await go(`exam/${eid}`,'#version-panel');const e=await api('exam',undefined,{id:eid}),v=e.versions[1],content=await api('version_content',undefined,{exam_id:eid,version_id:v.id});
    await page.goto(`${base}print?exam=${eid}&sets=${v.booklet_id}`);await page.locator('.download-png').waitFor();assert.match(await page.locator('.printed-version').textContent(),/Versão B/);
    const pngEvent=page.waitForEvent('download');await page.locator('.download-png').click();const png=await pngEvent;await png.saveAs('tests/artifacts/bank-version-b.png');
    const image=await loadImage('tests/artifacts/bank-version-b.png'),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const layout=compactLayout(8,5),scale=image.width/layout.width;
    for(let i=0;i<8;i++){const p=bubblePosition(i,content.questions[i].answer.charCodeAt(0)-65,layout);ctx.fillStyle='#111';ctx.beginPath();ctx.arc(p.x*scale,p.y*scale,p.r*.85*scale,0,Math.PI*2);ctx.fill();}
    const bitmap=ctx.getImageData(0,0,canvas.width,canvas.height),qr=decodeQr(bitmap,jsQR),card=(await api('cards',undefined,{exam_id:eid})).cards.find(c=>c.version_id===v.id);
    assert.equal(qr.data,card.token);const reading=readCard(bitmap,qr,8,5);assert.deepEqual(reading.answers.map(a=>a[0]),content.questions.map(q=>q.answer));
    const marked=canvas.toDataURL('image/png');
    // A câmera de teste é um stream de pixels reais do cartão preenchido.
    await page.addInitScript(({marked})=>{
        let stream;
        Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:async()=>[{kind:'videoinput',deviceId:'test-card',label:'Cartão de teste'}],getUserMedia:async()=>{
            const image=new Image();image.src=marked;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);stream=canvas.captureStream(10);const timer=setInterval(()=>canvas.getContext('2d').drawImage(image,0,0),100);stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
        }}});
    },{marked});
    await go(`exam/${eid}`,'#scan');await page.locator('#scan').click();await page.locator('#start-camera').click();await page.locator('#save-scan').waitFor({timeout:25000});
    assert.match(await page.locator('.reading-ready-header').textContent(),/Versão B/);
    const prior=await api('report',undefined,{id:eid});await page.locator('.scan-preview summary').click();await page.locator('#aligned').waitFor({state:'visible'});
    assert.equal((await api('report',undefined,{id:eid})).students.length,prior.students.length,'revisar câmera não grava antes de confirmar');
    await page.screenshot({path:'tests/artifacts/bank-camera-review.png',fullPage:true});
    await page.locator('#scan-student').selectOption({index:1});await page.locator('#save-scan').click();await page.locator('.scan-saved').waitFor();assert.match(await page.locator('.saved-result').textContent(),/7 acertos/);await page.locator('#close-scan').click();
    for(const hash of ['bank','compose',`exam/${eid}`,`reports/${eid}`]){
        await go(hash,hash==='bank'?'#bank-new':hash==='compose'?'#compose':hash.startsWith('exam')?'#version-panel':'#report-class');
        for(const width of [320,390,768,1366]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${hash}: sem overflow em ${width}px`);}
    }
    await page.setViewportSize({width:390,height:844});await go('compose','#compose');await page.screenshot({path:'tests/artifacts/bank-compose-mobile.png'});
    assert.deepEqual(errors,[]);console.log('OK: banco/montagem/prévia/finalização/PDF em navegador, PNG B com OMR real, revisão e confirmação na câmera, telas 320–1366px.');
}finally{await browser.close();}
