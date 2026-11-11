import {cardSvg,compactLayout,LAYOUT} from './layout.mjs?v=compact5';
import {cardPng} from './png-export.mjs?v=compact5';
const $=selector=>document.querySelector(selector);
$('#print').onclick=()=>window.print();
const params=new URLSearchParams(location.search);
$('#format').value=params.get('format')==='a4'?'a4':'compact';
let data=null;
function render(){
    if(!data)return;
    const {exam,questions,cards}=data,compact=$('#format').value==='compact';
    $('#cards').replaceChildren();
    for(const card of cards){
        const layout=compact?compactLayout(Number(card.question_count),Number(exam.alternatives)):LAYOUT;
        const svg=cardSvg({...card,layoutVersion:compact?3:2},exam,questions,window.qrcode);
        const item=document.createElement('article');item.className='print-card';
        const size=`${(layout.widthMm/10).toLocaleString('pt-BR',{maximumFractionDigits:2})} × ${(layout.heightMm/10).toLocaleString('pt-BR',{maximumFractionDigits:2})} cm`;
        item.innerHTML=`<div class="card-tools"><div><h2>Bloco ${card.page} · questões ${card.start_number}–${card.start_number+card.question_count-1}</h2><p>${size} · ${card.question_count} questões · ${exam.alternatives} alternativas</p></div><button type="button" class="download-png">Baixar PNG</button></div><section class="sheet" style="--card-width:${layout.widthMm}mm;--card-height:${layout.heightMm}mm">${svg}</section><p class="card-size">Na capa: insira com largura de <strong>${(layout.widthMm/10).toLocaleString('pt-BR',{maximumFractionDigits:2})} cm</strong>, mantendo a proporção e todo o fundo branco.</p>`;
        item.querySelector('.download-png').onclick=async event=>{
            const button=event.currentTarget;button.disabled=true;button.textContent='Preparando PNG…';
            try{
                const dpi=Number($('#resolution').value),blob=await cardPng(svg,layout,dpi),url=URL.createObjectURL(blob),link=document.createElement('a');
                link.href=url;link.download=`MarioProvas-simulado-${exam.id}-modelo-${card.booklet_id}-bloco-${card.page}-${compact?'compacto':'A4'}-${dpi}dpi.png`;
                document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
                $('#status').textContent=`PNG do bloco ${card.page} pronto. Use ${size} na capa para preservar bolhas e QR.`;
            }catch(error){$('#status').textContent=error.message;}
            finally{button.disabled=false;button.textContent='Baixar PNG';}
        };
        $('#cards').append(item);
    }
    $('#status').textContent=`${cards.length} bloco(s) pronto(s). ${compact?'Formato compacto selecionado.':'Formato A4 selecionado.'}`;
}
$('#format').onchange=render;
try{
    const selected=(params.get('sets')||'').split(',').map(Number),id=params.get('exam');
    const response=await fetch(`api.php?action=cards&exam_id=${encodeURIComponent(id)}`,{cache:'no-store'}),result=await response.json();
    if(!result.ok)throw Error(result.error);
    const {exam,questions,cards}=result.data,filtered=selected.some(Boolean)?cards.filter(c=>selected.includes(Number(c.booklet_id))):cards;
    if(!filtered.length)throw Error('Nenhum cartão disponível. Gere o modelo no simulado.');
    data={exam,questions,cards:filtered};$('#exam-title').textContent=exam.name;render();
}catch(error){$('#status').textContent=error.message;$('#print').disabled=true;$('#format').disabled=true;}