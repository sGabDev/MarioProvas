// QA visual em navegador real. Somente servidor/base temporários de integration.py.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const candidates=[process.env.MARIOPROVAS_PLAYWRIGHT,'playwright',path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean);
let playwright;
for(const candidate of candidates){try{playwright=require(candidate);break;}catch{}}
if(!playwright){console.log('SKIP: QA responsivo requer Playwright já instalado (MARIOPROVAS_PLAYWRIGHT); nenhum pacote de produção é necessário.');process.exit(0);}
const executable=[process.env.MARIOPROVAS_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(f=>f&&fs.existsSync(f));
const base=process.env.MARIOPROVAS_TEST_URL,eid=Number(process.env.MARIOPROVAS_TEST_EXAM);
if(!base||!eid)throw Error('Execute por tests/integration.py em base isolada.');
const audit=process.env.MARIOPROVAS_RESPONSIVE_AUDIT==='1',issues=[],checks=[];
const engine=process.env.MARIOPROVAS_BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const browser=await playwright[engine].launch({headless:true,...(engine==='chromium'&&executable?{executablePath:executable}:{}),...(engine==='chromium'?{args:['--no-first-run']}: {})});
const widths=[320,360,375,390,414,430,768,1024,1280,1440,1920];
const artifacts='tests/artifacts';fs.mkdirSync(artifacts,{recursive:true});
let page,context;
const wait=()=>page.waitForTimeout(45);
function verify(ok,label,details){checks.push(label);if(!ok){issues.push({label,details});if(!audit)throw Error(label+' '+JSON.stringify(details));}}
const go=async(hash,selector)=>{await page.evaluate(h=>{location.hash=h;},hash);await page.waitForLoadState('networkidle');await page.locator(selector).first().waitFor();await wait();};
const close=async()=>{if(await page.locator('dialog[open]').count())await page.evaluate(()=>new Promise(resolve=>{const m=document.querySelector('dialog');m.addEventListener('close',()=>resolve(),{once:true});m.close();}));};
async function dimensions(label){
    const metrics=await page.evaluate(()=>{
        const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
        const modal=document.querySelector('dialog[open]'),scope=modal||document.querySelector('main')||document.body;
        const inputs=[...scope.querySelectorAll('input:not([type=checkbox]):not([type=hidden]),select,textarea')].filter(visible).filter(el=>parseFloat(getComputedStyle(el).fontSize)<16).map(el=>el.id||el.tagName);
        const targets=[...scope.querySelectorAll('button,a.button,summary,.check-row,.annul-toggle')].filter(visible).filter(el=>{const r=el.getBoundingClientRect();return r.height<43.5||r.width<43.5;}).map(el=>el.id||el.className||el.tagName);
        const overlapping=[];
        for(const group of scope.querySelectorAll('.stats,.page-head,.card-header,.grade-band,.area-row,.report-filters,.editor-footer,.scanner-heading,.scan-counts,.scanner-counters,.card-tools')){
            const boxes=[...group.children].filter(visible).map(el=>el.getBoundingClientRect());
            for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)if(Math.min(boxes[i].right,boxes[j].right)-Math.max(boxes[i].left,boxes[j].left)>1&&Math.min(boxes[i].bottom,boxes[j].bottom)-Math.max(boxes[i].top,boxes[j].top)>1)overlapping.push(group.className);
        }
        const clipped=[];
        for(const el of [...scope.querySelectorAll('button,input,select,textarea')].filter(visible)){
            let parent=el.parentElement;const r=el.getBoundingClientRect();
            while(parent&&parent!==scope){const s=getComputedStyle(parent),p=parent.getBoundingClientRect();
                if(['hidden','clip'].includes(s.overflowX)&&((r.left<p.left-1)||(r.right>p.right+1))){clipped.push(el.id||el.tagName);break;}parent=parent.parentElement;
            }
        }
        const m=modal?.getBoundingClientRect();
        return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,smallInputs:inputs,smallTargets:targets,overlapping,clipped,modal:m?{x:m.x,y:m.y,width:m.width,height:m.height,maxHeight:visualViewport?.height||innerHeight}:null};
    });
    verify(metrics.overflow<=1,`${label}: página sem overflow em ${metrics.width}px`,{overflow:metrics.overflow});
    verify(Math.abs(metrics.width-page.viewportSize().width)<=1,`${label}: viewport não ampliada pelo conteúdo`,{actual:metrics.width,expected:page.viewportSize().width});
    verify(!metrics.smallInputs.length,`${label}: campos de 16px em ${metrics.width}px`,metrics.smallInputs);
    verify(!metrics.smallTargets.length,`${label}: alvos de toque de 44px em ${metrics.width}px`,metrics.smallTargets);
    verify(!metrics.overlapping.length,`${label}: componentes sem sobreposição em ${metrics.width}px`,metrics.overlapping);
    verify(!metrics.clipped.length,`${label}: controles sem corte em ${metrics.width}px`,metrics.clipped);
    if(metrics.modal)verify(metrics.modal.x>=-.5&&metrics.modal.y>=-.5&&metrics.modal.width<=metrics.width+1&&metrics.modal.height<=metrics.modal.maxHeight+1,`${label}: modal dentro da viewport em ${metrics.width}px`,metrics.modal);
}
async function matrix(label){
    for(const width of widths){await page.setViewportSize({width,height:width>=768?900:844});await wait();await dimensions(label);}
    for(const [width,height] of [[568,320],[844,390],[1024,600],[390,440]]){await page.setViewportSize({width,height});await wait();await dimensions(`${label} ${width}×${height}`);}
}
async function shot(label,modal=false){
    await page.setViewportSize({width:390,height:844});await wait();
    // O dialog fica fora de #app. Ocultar só o fundo mantém a geometria e
    // impede dados privados da tabela aparecerem nas margens da captura.
    const style=modal?await page.addStyleTag({content:'#app{visibility:hidden}'}):null;
    try{await page.screenshot({path:artifacts+`/ui-${label}-${engine}.png`});}finally{if(style)await style.evaluate(el=>el.remove());}
}
async function shotPage(label){
    // Redação somente no DOM da captura; a base e as respostas da API não mudam.
    await page.evaluate(async()=>{
        const students=(await(await fetch('api.php?action=students')).json()).data;
        const pairs=[];const classes=[...new Set(students.map(s=>s.class_name))];
        classes.forEach((value,i)=>pairs.push([value,'Turma de verificação '+(i+1)]));
        students.forEach((s,i)=>{pairs.push([s.name,'Estudante de verificação '+(i+1)]);if(s.social_name)pairs.push([s.social_name,'Nome social de verificação']);pairs.push([s.external_id,'ID privado']);});
        pairs.sort((a,b)=>b[0].length-a[0].length);
        const walker=document.createTreeWalker(document.querySelector('#app'),NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode()))for(const [from,to] of pairs)if(from&&node.textContent.includes(from))node.textContent=node.textContent.replaceAll(from,to);
    });
    for(const [width,height] of [[390,844],[1440,1000]]){await page.setViewportSize({width,height});await page.waitForTimeout(250);await page.screenshot({path:artifacts+`/ui-${label}-${width}-${engine}.png`,fullPage:true});}
}
async function login(){
    await page.goto(base);await page.locator('#auth').waitFor();
    await page.locator('#email').fill(process.env.MARIOPROVAS_TEST_EMAIL);await page.locator('#password').fill(process.env.MARIOPROVAS_TEST_PASSWORD);
    await page.locator('#auth button[type=submit]').click();await page.locator('.sidebar').waitFor({state:'attached'});await page.locator('.stats').first().waitFor();
}
try{
    context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.name));
    await page.goto(base);await page.locator('#auth').waitFor();await matrix('login');
    await shot('login');
    // Exercita o formulário de instalação sem executar nova instalação.
    await page.route('**/api.php?action=state',async route=>{const response=await route.fetch(),j=await response.json();j.data.installed=false;j.data.user=null;await route.fulfill({response,json:j});});
    await page.goto(base);await page.locator('#key').waitFor();await matrix('formulário de instalação');await page.unroute('**/api.php?action=state');
    await login();
    const classId=await page.evaluate(async()=>{const j=await(await fetch('api.php?action=students')).json();return j.data[0].class_id;});
    for(const [hash,selector,label] of [['home','.welcome','painel'],['exams','#exam-table','simulados'],['classes','.class-grid','turmas'],[`classes/${classId}`,'#student-table','estudantes'],['import','#upload','importação'],['team','#team-form','equipe'],['help','.steps','ajuda'],['reports','.card','lista de relatórios']]){await go(hash,selector);await matrix(label);if(label==='painel'||label==='turmas')await shotPage(label);}
    await go(`classes/${classId}`,'#student-table');await page.locator('#edit-grade').click();await matrix('modal de série');await close();
    await page.locator('[data-edit]').first().click();await matrix('modal de estudante');
    await page.setViewportSize({width:390,height:380});await page.locator('#social_name').focus();await page.locator('#edit-student button[type=submit]').scrollIntoViewIfNeeded();
    verify(await page.locator('#edit-student button[type=submit]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}), 'salvar cadastro acessível com viewport reduzida');await close();
    await go('new','#new-exam');await matrix('criar simulado');await page.locator('#prepare-key').click();await matrix('gabarito da criação');await shotPage('criar');
    await go(`exam/${eid}`,'#scan');await matrix('aplicação');
    await page.locator('#edit-key').click();await matrix('editar gabarito');await shot('gabarito',true);await close();
    await page.locator('#edit-grading').click();await page.locator('#enable-grading').check();await matrix('notas gerais');
    await page.locator('#grading-scope').selectOption('areas');await matrix('notas por área');
    await shot('notas',true);await close();
    await page.locator('#scan').click();await matrix('leitor desligado');
    verify(await page.locator('#camera').evaluate(el=>el.srcObject===null),'abrir leitor não solicita câmera');
    await shot('leitor',true);
    if(engine==='chromium'){
        // Vídeo de teste = SVG real desenhado no canvas, sem câmera física.
        await page.evaluate(async eid=>{
            const d=(await(await fetch('api.php?action=cards&exam_id='+eid)).json()).data,card=d.cards.filter(c=>c.question_count===60).at(-1);
            const {cardSvg,bubblePosition,compactLayout}=await import('./assets/layout.mjs?v=ui9'),{default:qr}=await import('./assets/vendor/qrcode.mjs');
            const layout=compactLayout(60,5),p=bubblePosition(0,0,layout),svg=cardSvg({...card,layoutVersion:3},d.exam,d.questions,qr).replace('</svg>',`<circle cx="${p.x}" cy="${p.y}" r="8.8" fill="black"/></svg>`);
            const image=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));image.src=url;await image.decode();
            const canvas=document.createElement('canvas');canvas.width=layout.width;canvas.height=layout.height;canvas.getContext('2d').drawImage(image,0,0);URL.revokeObjectURL(url);
            const stream=canvas.captureStream(15);window.__qaVideo={canvas,stream};
            Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>stream});
        },eid);
        await page.locator('#start-camera').click();await page.locator('#save-scan').waitFor({timeout:20000});await matrix('revisão da leitura óptica');
        verify(await page.locator('#save-scan').isEnabled(),'associação após reconhecimento óptico disponível');
    }
    await close();
    const result=await page.evaluate(async()=>{const j=await(await fetch('api.php?action=dashboard')).json();return j.data.exams.find(e=>e.graded>0)?.id;});
    await go(`reports/${result||eid}`,'#report-class');await matrix('relatório completo');await shotPage('relatorio');
    if(await page.locator('[data-result]').count()){await page.locator('[data-result]').first().click();await matrix('resultado individual');await close();}
    await page.locator('#report-class').selectOption({index:1});await wait();await dimensions('relatório filtrado');
    await page.locator('#clear-report-filters').click();await wait();
    await go('import','#upload');
    await page.evaluate(async()=>{
        const ss=(await(await fetch('api.php?action=students')).json()).data.slice(0,35),q=x=>'"'+String(x).replaceAll('"','""')+'"';
        const text=['id;Aluno: Nome;Turma: Nome',...ss.map(s=>[s.external_id,s.name,s.class_name].map(q).join(';'))].join('\n');
        const file=new File([text],'conferencia-isolada.csv',{type:'text/csv'}),dt=new DataTransfer();dt.items.add(file);document.querySelector('#csv').files=dt.files;document.querySelector('#upload').requestSubmit();
    });await page.locator('#map-form').waitFor();await matrix('mapeamento CSV');await page.locator('#map-form button').click();await page.locator('#import-table').waitFor();await matrix('prévia CSV');
    await page.goto(base+'print?exam='+eid+'&sets='+process.env.MARIOPROVAS_TEST_SET);await page.locator('.download-png').first().waitFor();await matrix('impressão compacta');await page.locator('#format').selectOption('a4');await matrix('impressão A4');
    await page.goto(base+'offline');await matrix('offline');
    if(!audit){
        await page.goto(base+'#home');await page.locator('#menu').waitFor();await page.setViewportSize({width:390,height:700});
        await page.locator('#menu').tap();verify(await page.locator('.sidebar').evaluate(el=>!el.inert),'menu móvel aberto e interativo');
        await dimensions('menu aberto');
        const nav=await page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().width);verify(nav<=page.viewportSize().width-40,'menu deixa área de fechamento por toque');
        await page.locator('.sidebar a').last().focus();await page.keyboard.press('Tab');verify(await page.locator('.sidebar a').first().evaluate(el=>el===document.activeElement),'Tab volta ao início do menu');
        await page.keyboard.press('Shift+Tab');verify(await page.locator('.sidebar a').last().evaluate(el=>el===document.activeElement),'Shift+Tab permanece no menu');
        await page.keyboard.press('Escape');verify(await page.locator('#menu').getAttribute('aria-expanded')==='false','Escape fecha menu');
        await page.locator('#menu').tap();await page.locator('#close-menu').tap();verify(await page.locator('#menu').evaluate(el=>el===document.activeElement),'foco volta ao botão do menu');
        await page.locator('#menu').tap();await page.touchscreen.tap(380,350);verify(await page.locator('#menu').getAttribute('aria-expanded')==='false','toque fora fecha menu');
        await page.locator('#menu').tap();await page.locator('.nav-item[href="#new"]').count();await page.locator('.nav-item[href="#exams"]').tap();await page.locator('#exam-table').waitFor();verify(await page.locator('#menu').getAttribute('aria-expanded')==='false','navegação por toque fecha menu');
        await go(`exam/${eid}`,'#edit-key');await page.locator('#edit-key').click();
        for(let i=0;i<15;i++){await page.keyboard.press('Tab');verify(await page.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)),'Tab permanece no modal');}
        verify(await page.evaluate(()=>parseFloat(getComputedStyle(document.activeElement).outlineWidth)>=2),'foco de teclado tem contorno visível');
        await page.keyboard.press('Escape');verify(!await page.locator('dialog[open]').count(),'Escape fecha modal');
        const scrollable=page.locator('.table-wrap[data-overflow="true"]').first();
        if(await scrollable.count()){await scrollable.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);verify(await scrollable.evaluate(el=>el.scrollLeft>0),'tabela permite rolagem pelo teclado');}
        await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#scan').click();verify(await page.locator('.paper-guide').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)===0),'respeita redução de movimento');await close();
        await page.setViewportSize({width:390,height:500});await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-bottom','28px');document.documentElement.style.setProperty('--safe-top','20px');});await page.locator('#edit-grading').click();
        verify(await page.locator('dialog').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight),'modal cabe com área segura e altura curta');await close();
        await page.setViewportSize({width:844,height:390});await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-left','40px');document.documentElement.style.setProperty('--safe-right','20px');});await page.locator('#edit-key').click();await wait();await dimensions('áreas seguras em paisagem');await close();
    }
    verify(!errors.length,'nenhum erro JavaScript nas páginas',errors);
    if(engine==='chromium'&&!audit){
        const pwa=await browser.newContext({viewport:{width:390,height:844}}),offline=await pwa.newPage();
        try{
            await offline.goto(base);await offline.waitForFunction(()=>navigator.serviceWorker?.controller!==null,{},{timeout:15000});
            await offline.evaluate(()=>navigator.serviceWorker.ready);
            verify(await offline.evaluate(async()=>!!await caches.match(new URL('assets/tokens.css?v=ui9',location.href).href)),'tokens da interface disponíveis no cache da PWA');
            await pwa.setOffline(true);await offline.goto(base+'offline');await offline.locator('.auth-card').waitFor();
            verify(await offline.locator('.auth-wrap').evaluate(el=>getComputedStyle(el).display==='grid'),'página offline mantém o layout sem rede');
            verify(await offline.evaluate(async()=>{const cs=await Promise.all((await caches.keys()).map(k=>caches.open(k)));for(const c of cs)for(const r of await c.keys())if(r.url.includes('api.php'))return false;return true;}),'PWA não armazena APIs escolares');
        }finally{await pwa.setOffline(false);await pwa.close();}
    }
    fs.writeFileSync(artifacts+`/responsividade-${engine}.json`,JSON.stringify({audit,checks:checks.length,widths,issues,browser:await browser.version()},null,2));
    console.log(`${audit?'AUDITORIA':'OK'}: ${checks.length} verificações responsivas no ${engine}; ${issues.length} falhas. Sem hardware Android/iOS.`);
}finally{
    if(issues.length)fs.writeFileSync(artifacts+`/responsividade-falhas-${engine}.json`,JSON.stringify({checks:checks.length,issues},null,2));
    await browser.close();
}
