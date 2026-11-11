import {cardSvg} from './layout.mjs';
document.querySelector('#print').onclick=()=>window.print();
try{
 const params=new URLSearchParams(location.search),id=params.get('exam'),selected=(params.get('sets')||'').split(',').map(Number);
 const r=await fetch(`api.php?action=cards&exam_id=${encodeURIComponent(id)}`,{cache:'no-store'});const j=await r.json();if(!j.ok)throw Error(j.error);
 const {exam,questions,cards}=j.data;const filtered=selected.some(Boolean)?cards.filter(c=>selected.includes(c.booklet_id)):cards;
 if(!filtered.length)throw Error('Nenhum cartão disponível. Gere os conjuntos no simulado.');
 for(const c of filtered){const page=document.createElement('section');page.className='sheet';page.innerHTML=cardSvg(c,exam,questions,window.qrcode);document.querySelector('#cards').append(page);}
 document.querySelector('#status').textContent=` ${filtered.length} folha(s) prontas.`;
}catch(e){document.querySelector('#status').textContent=e.message;document.querySelector('#print').disabled=true;}
