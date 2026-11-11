import {escapeHtml as esc} from './layout.mjs?v=ui9';
import {createScanEngine} from './scan-engine.mjs?v=ui9';
let active=null;
export function stopScanner(){
    if(!active)return;
    const s=active;active=null;s.stopped=true;s.paused=true;clearTimeout(s.timer);
    s.engine?.dispose();s.stream?.getTracks().forEach(t=>t.stop());s.resize?.disconnect();
    if(s.video)s.video.srcObject=null;
    if(s.frame){s.frame.width=0;s.frame.height=0;}
    s.modal.querySelector('#review')?.replaceChildren();
    const start=s.modal.querySelector('#camera-start');if(start)start.hidden=false;
    const label=s.modal.querySelector('#camera-label');if(label)label.textContent='Câmera desligada';
    const indicator=s.modal.querySelector('.camera-indicator');if(indicator)indicator.dataset.active='false';
    const pause=s.modal.querySelector('#pause-camera');if(pause)pause.disabled=true;
    const status=s.modal.querySelector('#camera-status');if(status)status.textContent='Câmera desligada. Toque em Ativar câmera para retomar.';
}
export function openScanner(exam,ui){
    stopScanner();
    const {api,toast,openModal,icon}=ui;
    const modal=openModal(`<div class="scanner-heading"><div><div class="eyebrow">Correção em sequência</div><h2>${esc(exam.name)}</h2><p>Enquadre só o cartão, mesmo quando estiver na capa. O QR serve para vários alunos.</p></div><button class="quiet" id="close-scan" aria-label="Fechar leitura">${icon('close')}</button></div><div class="scanner-layout"><section class="scanner-camera"><div class="scan-camera-toolbar"><span class="camera-indicator"><i></i><span id="camera-label">Câmera desligada</span></span><div><button class="quiet" id="torch" hidden aria-pressed="false">Luz</button><button class="quiet" id="refocus" hidden>Focar</button><button class="quiet" id="pause-camera" disabled>Pausar</button></div></div><div class="camera-stage" id="camera-stage"><video id="camera" playsinline muted aria-label="Imagem ao vivo da câmera"></video><div class="paper-guide" id="paper-guide"><span class="guide-corner tl"></span><span class="guide-corner tr"></span><span class="guide-corner bl"></span><span class="guide-corner br"></span><span class="guide-caption">Só o cartão dentro das marcas</span></div><svg class="scan-overlay" id="scan-overlay" viewBox="0 0 1000 1400" aria-hidden="true"><polygon id="detected-card" points=""></polygon></svg><div class="camera-start" id="camera-start"><span class="camera-start-icon">${icon('scan')}</span><h3>Pronto para corrigir?</h3><p>Use uma superfície plana e boa iluminação.<br>O acesso à câmera será solicitado ao ativar.</p><button id="start-camera">${icon('scan')}Ativar câmera</button></div></div><div class="camera-status-line" data-kind="idle"><span class="reading-indicator"></span><p id="camera-status" role="status" aria-live="polite">Aguardando ativação da câmera.</p><span id="scan-speed"></span></div><ol class="scan-progress" aria-label="Etapas da leitura"><li id="step-qr" data-state="current"><span>1</span>Identificar QR</li><li id="step-align"><span>2</span>Alinhar cartão</li><li id="step-marks"><span>3</span>Ler respostas</li></ol><details class="camera-settings"><summary>Ajustes da câmera</summary><div class="camera-settings-grid"><div><label for="camera-select">Câmera</label><select id="camera-select"><option>Ative a câmera para selecionar</option></select></div><div id="zoom-control" hidden><label for="camera-zoom">Aproximação <output id="zoom-value">1×</output></label><input id="camera-zoom" type="range" min="1" max="3" step="0.1" value="1"></div><div id="exposure-control" hidden><label for="camera-exposure">Clarear a captura</label><input id="camera-exposure" type="range" min="0" max="2" step="0.1"></div><button class="secondary" type="button" id="restart-camera">Reiniciar câmera</button></div><p>As opções de luz, foco e zoom aparecem quando o dispositivo oferece suporte.</p></details></section><aside class="scanner-panel"><div class="scanner-counters"><div><strong id="saved-count">0</strong><span>folhas salvas agora</span></div><div><strong id="pending-count">${exam.students.filter(s=>!s.result_id).length}</strong><span>alunos pendentes</span></div></div><div id="review"></div></aside></div>`);
    modal.classList.add('scanner-dialog');
    const $=selector=>modal.querySelector(selector);
    const s={modal,video:$('#camera'),stream:null,engine:null,stopped:false,paused:true,processing:false,timer:null,stable:null,previous:null,identity:new Map(),identityErrors:new Map(),removeGuard:null,savedPages:0,lastStudent:null,refreshAt:0,capture:0,generation:0};
    active=s;
    const frame=document.createElement('canvas'),ctx=frame.getContext('2d',{willReadFrequently:true});
    s.frame=frame;
    const status=(message,kind='reading')=>{
        if($('#camera-status').textContent!==message)$('#camera-status').textContent=message;
        $('.camera-status-line').dataset.kind=kind;
    };
    const phase=n=>['#step-qr','#step-align','#step-marks'].forEach((selector,i)=>$(selector).dataset.state=i<n?'done':i===n?'current':'');
    const showAlignment=(markers=[],width=frame.width,height=frame.height,state='ready')=>{
        $('#scan-overlay').setAttribute('viewBox',`0 0 ${width||1000} ${height||1400}`);
        $('#detected-card').setAttribute('points',markers.map(p=>`${p.x},${p.y}`).join(' '));
        $('#detected-card').dataset.state=state;
    };
    const placeholder=()=>{$('#review').innerHTML=`<div class="reader-placeholder"><span class="placeholder-icon">${icon('file')}</span><h3>Vamos ler o cartão</h3><p>O QR identifica a prova.<br>As bolhas preenchidas revelam as respostas.</p><ul><li>Mostre as quatro marcas do cartão.</li><li>Preencha a bolha inteira com cor nítida.</li><li>Depois da leitura, escolha o aluno.</li></ul><div class="ink-colors" aria-label="Leitura de tinta preta, azul, vermelha, verde, roxa, rosa, laranja, amarela e outras cores"><i style="--ink:#20272b"></i><i style="--ink:#225ac2"></i><i style="--ink:#cf3d44"></i><i style="--ink:#267a50"></i><i style="--ink:#8146a4"></i><i style="--ink:#e85c9e"></i><i style="--ink:#e99930"></i><i style="--ink:#ecd34d"></i></div><small>Tintas muito claras ou reflexos podem exigir uma nova captura.</small></div>`;};
    placeholder();
    const updateGuide=()=>{
        const stage=$('#camera-stage'),w=stage.clientWidth||600,h=stage.clientHeight||600,guide=$('#paper-guide');
        const ratio=s.cardRatio||.75,height=Math.min(h*.84,w*.86*ratio);guide.style.height=`${height}px`;guide.style.width=`${height/ratio}px`;
    };
    if(typeof ResizeObserver!=='undefined'){s.resize=new ResizeObserver(updateGuide);s.resize.observe($('#camera-stage'));}
    updateGuide();
    $('#close-scan').onclick=()=>modal.close();
    modal.addEventListener('close',()=>{if(active===s)stopScanner();modal.classList.remove('scanner-dialog');},{once:true});
    modal.addEventListener('cancel',()=>{if(active===s)stopScanner();},{once:true});
    const freshStudents=async()=>{
        const now=Date.now();if(now-s.refreshAt<30000)return;s.refreshAt=now;const revision=s.savedPages;
        try{const latest=await api('exam',undefined,{id:exam.id});if(active===s&&!s.stopped&&revision===s.savedPages)exam.students=latest.students;}catch{/* A gravação valida o cadastro e a duplicidade no servidor. */}
    };
    // Modelos reutilizáveis já pertencem a este simulado. Prefetch elimina
    // uma ida ao servidor no caminho crítico de cada página conhecida.
    api('cards',undefined,{exam_id:exam.id}).then(data=>{
        if(active!==s)return;
        for(const card of data.cards)if(card.reusable)s.identity.set(card.token,{...card,booklet:card.booklet_id,student_id:null});
    }).catch(()=>{});
    async function configureTrack(track){
        const caps=track.getCapabilities?.()||{},advanced={};
        for(const key of ['focusMode','exposureMode','whiteBalanceMode'])if(caps[key]?.includes?.('continuous'))advanced[key]='continuous';
        for(const [key,value] of Object.entries(advanced))try{await track.applyConstraints({advanced:[{[key]:value}]});}catch{}
        if(caps.torch)try{await track.applyConstraints({advanced:[{torch:false}]});}catch{}
        const exposure=caps.exposureCompensation;
        $('#exposure-control').hidden=!(exposure&&exposure.max>exposure.min);
        if(exposure){const range=$('#camera-exposure');range.min=exposure.min;range.max=exposure.max;range.step=exposure.step||.1;range.value=track.getSettings().exposureCompensation||0;range.onchange=async()=>{try{await track.applyConstraints({advanced:[{exposureCompensation:Number(range.value)}]});s.stable=null;}catch{toast('A câmera não permite ajustar a exposição.');}};}
        $('#torch').hidden=!caps.torch;$('#torch').setAttribute('aria-pressed','false');
        $('#refocus').hidden=!caps.focusMode?.length;
        $('#torch').onclick=async()=>{const on=$('#torch').getAttribute('aria-pressed')!=='true';try{await track.applyConstraints({advanced:[{torch:on}]});$('#torch').setAttribute('aria-pressed',String(on));$('#torch').textContent=on?'Luz ligada':'Luz';}catch{toast('A câmera não permitiu alterar a luz.');}};
        $('#refocus').onclick=async()=>{try{const mode=caps.focusMode.includes('single-shot')?'single-shot':'continuous';await track.applyConstraints({advanced:[{focusMode:mode}]});s.stable=null;toast('Foco solicitado. Mantenha a folha firme.');}catch{toast('Não foi possível ajustar o foco nesta câmera.');}};
        const zoom=caps.zoom;$('#zoom-control').hidden=!(zoom&&zoom.max>zoom.min);
        if(zoom){const range=$('#camera-zoom');range.min=zoom.min;range.max=Math.min(zoom.max,5);range.step=zoom.step||.1;range.value=track.getSettings().zoom||zoom.min;$('#zoom-value').textContent=Number(range.value).toFixed(1)+'×';range.oninput=()=>$('#zoom-value').textContent=Number(range.value).toFixed(1)+'×';range.onchange=async()=>{try{await track.applyConstraints({advanced:[{zoom:Number(range.value)}]});s.previous=null;s.stable=null;}catch{toast('Este dispositivo não permitiu alterar o zoom.');}};}
    }
    async function start(deviceId){
        if(!modal.open)return;
        active=s;const generation=++s.generation;clearTimeout(s.timer);s.engine?.dispose();s.stream?.getTracks().forEach(t=>t.stop());
        s.stopped=false;s.paused=true;s.processing=false;s.stable=null;s.previous=null;s.removeGuard=null;s.cameraTime=null;
        $('#start-camera').disabled=true;status('Solicitando acesso à câmera…');
        if(!window.isSecureContext){status('A câmera exige HTTPS. Para testar no próprio computador, use localhost.','error');$('#start-camera').disabled=false;return;}
        if(!navigator.mediaDevices?.getUserMedia){status('Este navegador não permite acessar a câmera. Abra em um navegador compatível.','error');$('#start-camera').disabled=false;return;}
        s.engine=createScanEngine();
        try{
            let stream;
            try{stream=await navigator.mediaDevices.getUserMedia({video:{...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}}),width:{ideal:1920},height:{ideal:1440},frameRate:{ideal:24,max:30}},audio:false});}
            catch(e){if(e.name!=='OverconstrainedError')throw e;stream=await navigator.mediaDevices.getUserMedia({video:deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}},audio:false});}
            if(active!==s||s.stopped||generation!==s.generation){stream.getTracks().forEach(t=>t.stop());return;}
            s.stream=stream;s.video.srcObject=stream;await s.video.play();
            if(active!==s||s.stopped||generation!==s.generation)return;
            s.paused=false;$('#camera-start').hidden=true;$('#pause-camera').disabled=false;$('#pause-camera').textContent='Pausar';$('#camera-label').textContent='Câmera ativa';$('.camera-indicator').dataset.active='true';phase(0);placeholder();
            const track=stream.getVideoTracks()[0];configureTrack(track).catch(()=>{});
            navigator.mediaDevices.enumerateDevices().then(devices=>{
                if(active!==s||s.stopped)return;
                const cameras=devices.filter(d=>d.kind==='videoinput');$('#camera-select').innerHTML=cameras.map((d,i)=>`<option value="${esc(d.deviceId)}">${esc(d.label||'Câmera '+(i+1))}</option>`).join('');$('#camera-select').value=track.getSettings().deviceId||cameras[0]?.deviceId;
            }).catch(()=>{});
            if(typeof window.BarcodeDetector==='function')try{s.native=new window.BarcodeDetector({formats:['qr_code']});}catch{s.native=null;}
            freshStudents();updateGuide();status('Enquadre o cartão inteiro, com as quatro marcas. A leitura é automática.');schedule(0);
        }catch(e){
            const messages={NotAllowedError:'Acesso à câmera não autorizado. Libere a câmera nas permissões do navegador e tente novamente.',NotFoundError:'Nenhuma câmera encontrada. Conecte uma câmera e tente novamente.',NotReadableError:'Câmera ocupada. Feche outros aplicativos que a estejam usando.'};
            status(messages[e.name]||'Não foi possível ativar a câmera. Escolha outra câmera ou reinicie o navegador.','error');
            $('#camera-start').hidden=false;s.engine?.dispose();s.stream?.getTracks().forEach(t=>t.stop());
        }finally{$('#start-camera').disabled=false;}
    }
    $('#start-camera').onclick=()=>start();$('#restart-camera').onclick=()=>start($('#camera-select').value||undefined);$('#camera-select').onchange=event=>start(event.target.value);
    $('#pause-camera').onclick=()=>{s.paused=!s.paused;$('#pause-camera').textContent=s.paused?'Continuar':'Pausar';if(s.paused){clearTimeout(s.timer);status('Leitura pausada. Toque em Continuar para retomar.','idle');}else{status('Enquadre o próximo cartão.');schedule(0);}};
    function schedule(delay=80){clearTimeout(s.timer);if(active===s&&!s.stopped&&!s.paused)s.timer=setTimeout(loop,delay);}
    async function loop(){
        if(active!==s||s.stopped||s.paused||s.processing)return;
        if(s.video.readyState<2||!s.video.videoWidth){schedule(80);return;}
        const cameraTime=s.video.currentTime;if(cameraTime>0&&cameraTime===s.cameraTime){schedule(35);return;}s.cameraTime=cameraTime;
        const generation=s.generation,started=performance.now();s.processing=true;let readingCard=null;
        try{
            const scale=Math.min(1,1600/Math.max(s.video.videoWidth,s.video.videoHeight)),width=Math.round(s.video.videoWidth*scale),height=Math.round(s.video.videoHeight*scale);
            if(frame.width!==width)frame.width=width;if(frame.height!==height)frame.height=height;
            ctx.drawImage(s.video,0,0,width,height);const image=ctx.getImageData(0,0,width,height);
            let hint=null;
            if(s.native&&!s.previous){try{const codes=await s.native.detect(s.video);const box=codes.find(c=>/^[a-f0-9]{32}$/.test(c.rawValue))?.boundingBox;if(box)hint={x:box.x*scale,y:box.y*scale,width:box.width*scale,height:box.height*scale};}catch{s.native=null;}}
            if(active!==s||s.stopped||generation!==s.generation)return;
            const qr=await s.engine.decode(image,{previous:s.previous,hint,thorough:s.capture++%2===0});
            if(active!==s||s.stopped||generation!==s.generation)return;
            if(!qr){s.stable=null;s.previous=null;s.removeGuard=null;phase(0);showAlignment();status('QR não identificado. Mostre o cartão inteiro, aproxime um pouco e evite reflexos.');return;}
            s.previous=qr;phase(1);
            if(!/^[a-f0-9]{32}$/.test(qr.data)){s.stable=null;status('QR desconhecido. Use o cartão gerado pelo MarioProvas.','error');return;}
            const rejected=s.identityErrors.get(qr.data);if(rejected&&Date.now()-rejected.at<5000){status(rejected.message,'error');return;}
            let card=s.identity.get(qr.data);
            if(!card){try{card=await api('identify',undefined,{token:qr.data,exam_id:exam.id});s.identity.set(qr.data,card);}catch(e){s.identityErrors.set(qr.data,{at:Date.now(),message:e.message});throw e;}}
            if(active!==s||s.stopped||generation!==s.generation)return;
            if(card.processed){status('Cartão individual já processado. Apresente a próxima folha.','error');return;}
            readingCard=card;const reading=await s.engine.read(card.question_count,exam.alternatives);
            if(active!==s||s.stopped||generation!==s.generation)return;
            s.cardRatio=reading.layout.height/reading.layout.width;updateGuide();phase(2);showAlignment(reading.markers,width,height);
            const signature=JSON.stringify(reading.answers);
            if(s.removeGuard?.token===qr.data&&s.removeGuard.signature===signature){s.stable=null;status('Retire a folha já salva do enquadramento antes de apresentar o próximo aluno.','success');return;}
            s.removeGuard=null;
            if(!s.stable||s.stable.token!==qr.data||s.stable.signature!==signature){s.stable={token:qr.data,signature,at:performance.now()};status('QR e folha identificados. Confirmando as marcações…');return;}
            s.stable=null;s.paused=true;$('#pause-camera').disabled=true;phase(3);
            $('#scan-speed').title='Tempo de processamento da última captura';$('#scan-speed').textContent=`${Math.round(performance.now()-started)} ms`;
            status('Leitura pronta. Escolha o aluno para salvar.','success');renderReview(card,qr.data,reading);freshStudents();
        }catch(e){
            if(active!==s||s.stopped||generation!==s.generation)return;
            s.stable=null;if(['ambiguous','print','shadow','blur','light','resolution'].includes(e.code))phase(2);
            showAlignment(e.details?.markers,e.details?.width,e.details?.height,'retry');
            const questions=e.code==='ambiguous'&&readingCard&&e.details?.questions?.length?` Confira Q${e.details.questions.slice(0,6).map(n=>n+readingCard.start_number-1).join(', Q')}.`:'';
            status(e.message+questions+(e.code?' Nada foi salvo.':''),'error');
        }finally{if(generation===s.generation){s.processing=false;schedule(Math.max(25,120-(performance.now()-started)));}}
    }
    function resume(clear=true){
        if(window.innerWidth<700)$('#camera-stage').scrollIntoView({behavior:'smooth',block:'start'});
        if(clear)placeholder();s.paused=false;s.stable=null;$('#pause-camera').disabled=false;$('#pause-camera').textContent='Pausar';phase(0);status('Pronto para o próximo cartão. Retire a folha anterior.');schedule(0);
    }
    function renderReview(card,token,reading){
        const available=exam.students.filter(student=>!student.result_id&&(card.reusable?(!student.booklet_id||student.template_id===card.booklet)&&!(student.scanned_pages||[]).includes(card.page):(!student.booklet_id||student.booklet_id===card.booklet))&&(!card.student_id||student.id===card.student_id));
        const review=$('#review'),selected=card.student_id||(available.some(student=>student.id===s.lastStudent&&!student.result_id)?s.lastStudent:null);
        review.innerHTML=`<div class="reading-ready"><div class="reading-ready-header"><span>${icon('check')}Marcações reconhecidas</span><span class="badge">Folha ${card.page}</span></div><h3>De qual aluno é este cartão?</h3><p class="small muted">Questões ${card.start_number}–${card.start_number+card.question_count-1} · ${card.reusable?'QR reutilizável':'Cartão individual'}</p><div class="scan-counts"><span><strong>${reading.answers.filter(a=>a.length===1).length}</strong> com uma marca</span><span><strong>${reading.blank}</strong> em branco</span><span><strong>${reading.multiple}</strong> múltiplas</span></div><form id="assign"><div class="field"><label for="student-search">Buscar aluno, turma ou matrícula</label><input id="student-search" type="search" placeholder="Digite para encontrar…" autocomplete="off"></div><div class="field"><label for="scan-student">Estudante desta folha</label><select id="scan-student" required><option value="">Selecione o aluno</option>${available.map(student=>`<option value="${student.id}" ${student.id===selected?'selected':''}>${esc(student.social_name||student.name)} · ${esc(student.class_name||'')} · ${esc(student.external_id)}</option>`).join('')}</select></div>${available.length?'':'<p class="note warn">Não há alunos pendentes para esta folha. Confira se já foi salva ou se pertence ao modelo de uma leitura em andamento.</p>'}${selected?'<p class="small muted">Confira o estudante selecionado antes de salvar.</p>':''}<button type="submit" id="save-scan" ${available.length?'':'disabled'}>${icon('check')}Salvar e continuar</button><button class="quiet" id="retry-scan" type="button">Refazer esta leitura</button><div id="save-error" role="alert"></div></form><details class="scan-preview"><summary>Conferir imagem e marcações</summary><p class="small muted">Prévia com contraste corrigido. Branco e múltiplas contam como erro.</p><canvas id="aligned" width="800" height="1120" aria-label="Prévia alinhada com contraste reforçado"></canvas><div class="report-questions">${reading.answers.map((a,i)=>`<div class="question-chip ${a.length===1?'':'blank'}"><strong>Q${card.start_number+i}</strong>${a.length===1?a[0]:a.length?'Múltiplas: '+a.join(', '):'Em branco'}</div>`).join('')}</div></details></div>`;
        const canvas=$('#aligned');canvas.width=reading.layout.width;canvas.height=reading.layout.height;const cx=canvas.getContext('2d'),image=cx.createImageData(canvas.width,canvas.height);
        for(let i=0,p=0;i<reading.normalized.length;i++,p+=4){image.data[p]=image.data[p+1]=image.data[p+2]=reading.normalized[i];image.data[p+3]=255;}cx.putImageData(image,0,0);
        const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
        $('#student-search').oninput=event=>{
            const term=normalize(event.target.value),filtered=available.filter(student=>normalize(`${student.name} ${student.social_name} ${student.class_name} ${student.external_id}`).includes(term));
            const old=$('#scan-student').value;$('#scan-student').innerHTML='<option value="">Selecione o aluno</option>'+filtered.map(student=>`<option value="${student.id}">${esc(student.social_name||student.name)} · ${esc(student.class_name||'')} · ${esc(student.external_id)}</option>`).join('');
            if(filtered.some(student=>String(student.id)===old))$('#scan-student').value=old;else if(filtered.length===1)$('#scan-student').value=String(filtered[0].id);
        };
        $('#retry-scan').onclick=()=>resume();
        $('#assign').onsubmit=async event=>{
            event.preventDefault();const button=$('#save-scan'),studentId=Number($('#scan-student').value);if(button.disabled)return;
            if(!studentId){$('#save-error').innerHTML='<div class="error">Selecione o estudante antes de salvar.</div>';return;}
            button.disabled=true;
            try{
                const out=await api('scan',{exam_id:exam.id,token,student_id:studentId,scores:reading.scores,quality:reading.quality});
                if(active!==s||s.stopped)return;
                card.processed=!card.reusable;s.removeGuard={token,signature:JSON.stringify(reading.answers)};
                const student=exam.students.find(x=>x.id===studentId);student.booklet_id=out.booklet_id;student.template_id=out.template_id;student.scanned_pages=[...new Set([...(student.scanned_pages||[]),out.scanned_page])];
                if(out.complete)student.result_id=out.result_id;
                s.lastStudent=out.complete?null:studentId;
                if(!card.reusable)for(const known of s.identity.values())if(known.booklet===card.booklet)known.student_id=studentId;
                s.savedPages++;$('#saved-count').textContent=s.savedPages;$('#pending-count').textContent=exam.students.filter(x=>!x.result_id).length;
                toast(out.message);ui.onSaved?.();
                review.innerHTML=`<div class="scan-saved"><span class="saved-icon">${icon('check')}</span><h3>${out.complete?'Resultado salvo':'Página salva'}</h3><strong>${esc(student.social_name||student.name)}</strong><p>${esc(student.class_name||'')}</p><p class="saved-result">${out.complete?`${out.correct} acertos em ${out.valid} questões válidas; ${out.incorrect} erros; ${out.annulled} anuladas pelo professor; ${out.credited} créditos.${out.grade===null?'':` Nota: ${out.grade.toLocaleString('pt-BR')}.`} ${out.percentage===null?'Percentual não calculável.':out.percentage+'% de acertos.'}`:esc(out.message)}</p><p class="small muted">Retire a folha anterior. A próxima leitura já está ativa.</p><button id="next-card">${icon('scan')}Próximo cartão</button></div>`;
                $('#next-card').onclick=()=>resume();resume(false);
            }catch(e){if($('#save-error'))$('#save-error').innerHTML=`<div class="error">${esc(e.message)}</div>`;button.disabled=false;}
        };
        if(window.innerWidth>720)$('#student-search').focus({preventScroll:true});else review.scrollIntoView({behavior:'smooth',block:'start'});
    }
}
