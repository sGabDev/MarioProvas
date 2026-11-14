import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let playwright;
for(const candidate of [process.env.MARIOPROVAS_PLAYWRIGHT,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)){try{playwright=require(candidate);break;}catch{}}
if(!playwright)throw Error('Playwright necessário para conferir cadastro e equipe.');
const executable=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
const browser=await playwright.chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
const base=process.env.MARIOPROVAS_TEST_URL,password=process.env.MARIOPROVAS_TEST_PASSWORD;
const admin=await browser.newPage({viewport:{width:1366,height:950}}),publicContext=await browser.newContext(),page=await publicContext.newPage();
const errors=[];for(const p of [admin,page])p.on('pageerror',e=>errors.push(e.message));
const login=async(p,email,pass)=>{await p.goto(base+'#login');await p.locator('#email').fill(email);await p.locator('#password').fill(pass);await p.locator('#auth button[type=submit]').click();await p.locator('.shell').waitFor();};
try{
    await page.goto(base+'#login');await page.getByRole('link',{name:'Criar minha conta',exact:true}).click();await page.locator('#register-form').waitFor();
    if(await page.locator('#register-school').count())await page.locator('#register-school').selectOption({index:1});
    for(const [key,value] of Object.entries({name:'Cadastro pelo navegador',email:'browser-new@example.invalid',phone:'(21) 99999-1111',knowledge_area:'Linguagens',discipline:'Língua Portuguesa',password,confirm_password:password}))await page.locator(`#register-${key}`).fill(value);
    await page.locator('[name=shifts][value=morning]').check();await page.locator('[name=shifts][value=evening]').check();
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));fs.mkdirSync('tests/artifacts',{recursive:true});await page.screenshot({path:'tests/artifacts/accounts-register-mobile.png',fullPage:true});
    await page.locator('#register-form button[type=submit]').click();await page.locator('#registration-pending').waitFor();assert.match(await page.locator('#registration-pending').textContent(),/Aguarde a aprovação/);
    await page.getByRole('link',{name:'Já tenho conta / voltar para entrar'}).click();await page.locator('#email').fill('browser-new@example.invalid');await page.locator('#password').fill(password);await page.locator('#auth button[type=submit]').click();await page.locator('#auth .error').filter({hasText:'aguarda aprovação'}).waitFor();assert.equal(await page.locator('.shell').count(),0);
    await login(admin,process.env.MARIOPROVAS_TEST_EMAIL,password);await admin.locator('a[href="#team"]').click();await admin.locator('#team-form').waitFor();
    const pendingCard=admin.locator('.class-grid article').filter({hasText:'browser-new@example.invalid'});assert.match(await pendingCard.textContent(),/Matutino, Noturno/);await pendingCard.getByRole('button',{name:'Autorizar',exact:true}).click();await pendingCard.waitFor({state:'detached'});
    await login(page,'browser-new@example.invalid',password);assert.equal(await page.locator('a[href="#team"]').count(),0);
    const row=admin.locator('tbody tr').filter({hasText:'browser-new@example.invalid'});await row.getByRole('button',{name:'Editar',exact:true}).click();await admin.locator('#staff-edit').waitFor();
    await admin.locator('#edit-user-name').fill('Nome atualizado na equipe');await admin.locator('#edit-user-phone').fill('(21) 98888-2222');await admin.locator('#edit-user-discipline').fill('Redação');await admin.locator('#staff-edit [name=shifts][value=afternoon]').check();await admin.locator('#staff-edit [name=shifts][value=morning]').uncheck();await admin.locator('#edit-user-password').fill(password+'-new');
    await admin.setViewportSize({width:390,height:844});assert.ok(await admin.evaluate(()=>document.querySelector('#modal').scrollWidth<=innerWidth));await admin.screenshot({path:'tests/artifacts/accounts-edit-mobile.png',fullPage:true});
    await admin.locator('#staff-edit button[type=submit]').click();await admin.locator('#modal').waitFor({state:'hidden'});await admin.locator('tbody tr').filter({hasText:'Nome atualizado na equipe'}).waitFor();
    await page.reload();await page.locator('#auth').waitFor();await login(page,'browser-new@example.invalid',password+'-new');
    await admin.setViewportSize({width:1366,height:950});const updated=admin.locator('tbody tr').filter({hasText:'browser-new@example.invalid'});await updated.getByRole('button',{name:'Suspender acesso'}).click();await admin.locator('tbody tr').filter({hasText:'browser-new@example.invalid'}).getByText('Suspenso',{exact:true}).waitFor();
    await page.reload();await page.locator('#auth').waitFor();await admin.locator('tbody tr').filter({hasText:'browser-new@example.invalid'}).getByRole('button',{name:'Autorizar acesso'}).click();
    await admin.locator('tbody tr').filter({hasText:'browser-new@example.invalid'}).getByText('Autorizado',{exact:true}).waitFor();
    for(const width of [320,390,768,1366]){await admin.setViewportSize({width,height:950});assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`equipe sem overflow em ${width}`);}
    await admin.setViewportSize({width:1366,height:950});await admin.screenshot({path:'tests/artifacts/accounts-team-desktop.png',fullPage:true});assert.deepEqual(errors,[]);
    console.log('OK: cadastro real no navegador, espera pela aprovação, autorização, edição com múltiplos turnos, senha, suspensão/reativação e telas 320–1366px.');
}finally{await browser.close();}
