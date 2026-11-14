import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let playwright;
for(const candidate of [process.env.MARIOPROVAS_PLAYWRIGHT,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{playwright=require(candidate);break;}catch{}}
if(!playwright)throw Error('Playwright necessário para verificar exclusão.');
const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await playwright.chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
const base=process.env.MARIOPROVAS_TEST_URL,password=process.env.MARIOPROVAS_TEST_PASSWORD,eid=process.env.MARIOPROVAS_TEST_EXAM;
const manager=await browser.newPage({viewport:{width:1366,height:950},acceptDownloads:true}),teacher=await(await browser.newContext()).newPage();const errors=[];
for(const p of [manager,teacher])p.on('pageerror',e=>errors.push(e.message));
const login=async(page,email)=>{await page.goto(base);await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.locator('#auth button[type=submit]').click();await page.locator('.shell').waitFor();};
try{
    await login(teacher,process.env.MARIOPROVAS_DELETE_TEACHER);await teacher.goto(base+'#exams');await teacher.locator('#search').waitFor();assert.equal(await teacher.locator('[data-delete-exam]').count(),0);
    await teacher.goto(base+`#exam/${eid}`);await teacher.locator('#scan').waitFor();assert.equal(await teacher.locator('[data-delete-exam]').count(),0);
    await login(manager,process.env.MARIOPROVAS_DELETE_OPERATOR);
    assert.ok(await manager.locator('.sidebar a[href="#compose"]').isVisible());await manager.locator('.sidebar a[href="#new"]').click();await manager.locator('#new-exam').waitFor();assert.match(await manager.locator('#main h1').textContent(),/Cartão para prova externa/);
    assert.equal(await manager.locator('#statement').count(),0);await manager.locator('#exam-name').fill('Cartão externo de teste de exclusão');await manager.locator('#area-0').fill('Matemática');await manager.locator('#count-0').fill('3');await manager.locator('#prepare-key').click();
    for(const select of await manager.locator('[data-answer-area]').all())await select.selectOption('A');
    await manager.locator('#new-exam button[type=submit]').click();await manager.locator('#generate').waitFor();const created=new URL(manager.url()).hash.split('/')[1];assert.ok(Number(created)>0);assert.equal(await manager.locator('#version-panel').count(),0);
    await manager.locator('#generate button').click();const print=manager.getByRole('link',{name:'Abrir impressão do modelo reutilizável',exact:true});await print.waitFor();
    const printPage=await manager.context().newPage();await printPage.goto(new URL(await print.getAttribute('href'),base).href);await printPage.locator('.download-png').waitFor();const download=printPage.waitForEvent('download');await printPage.locator('.download-png').click();const png=await download;assert.match(png.suggestedFilename(),/\.png$/);await png.saveAs('tests/artifacts/external-card-created.png');await printPage.close();
    await manager.locator('[data-delete-exam]').click();await manager.locator('#confirm-delete-exam').waitFor();await manager.locator('[data-cancel-delete]').click();await manager.locator('#modal').waitFor({state:'hidden'});assert.ok(await manager.locator('#generate').isVisible());
    await manager.goto(base+'#exams');await manager.locator('#search').fill('Cartão externo de teste');await manager.locator(`[data-delete-exam="${created}"]`).click();await manager.locator('#confirm-delete-exam').waitFor();
    await manager.setViewportSize({width:390,height:844});assert.ok(await manager.evaluate(()=>document.querySelector('#modal').scrollWidth<=innerWidth));await manager.screenshot({path:'tests/artifacts/exam-delete-mobile.png',fullPage:true});
    await manager.locator('#confirm-delete-exam').click();await manager.locator('#modal').waitFor({state:'hidden'});await manager.locator('#search').waitFor();assert.equal(await manager.locator(`[data-delete-exam="${created}"]`).count(),0);
    assert.ok(await manager.locator('.sidebar a[href="#compose"]').count());assert.deepEqual(errors,[]);
    console.log('OK: dois caminhos de criação, cartão externo real em PNG, exclusão por operador, cancelamento, filtro e confirmação móvel; professor sem botões de exclusão.');
}finally{await browser.close();}
