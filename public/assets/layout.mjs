export const QR_LAYOUTS=Object.freeze([{x:580,y:72,size:160},{x:600,y:88,size:132}]);
export const LAYOUT = Object.freeze({width:800,height:1120,markers:[{x:40,y:40},{x:760,y:40},{x:760,y:1080},{x:40,y:1080}],markerSize:20,qr:QR_LAYOUTS[0],perPage:60});
export function bubblePosition(index,alternative){return {x:116+Math.floor(index/20)*236+alternative*32,y:328+(index%20)*34,r:10};}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function cardSvg(card,exam,questions,qrFactory){
  const esc=escapeHtml;const qr=qrFactory(0,'M');qr.addData(card.token);qr.make();const n=qr.getModuleCount(),geometry=QR_LAYOUTS[card.layoutVersion===1?1:0];const mod=geometry.size/n;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1120" role="img" aria-label="Cartão-resposta" style="font-family:Arial,sans-serif"><rect width="800" height="1120" fill="white"/><g fill="black">`;
  for(const p of LAYOUT.markers)svg+=`<rect x="${p.x-10}" y="${p.y-10}" width="20" height="20"/>`;
  svg+=`</g><rect x="${geometry.x-4*mod}" y="${geometry.y-4*mod}" width="${geometry.size+8*mod}" height="${geometry.size+8*mod}" fill="white"/><g fill="black">`;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))svg+=`<rect x="${geometry.x+x*mod}" y="${geometry.y+y*mod}" width="${mod+.015}" height="${mod+.015}"/>`;
  svg+=`</g><text x="72" y="108" font-size="30" font-weight="bold">MarioProvas</text><defs><clipPath id="header-${card.token}"><rect x="72" y="118" width="470" height="100"/></clipPath></defs><g clip-path="url(#header-${card.token})"><text x="72" y="144" font-size="18">${esc(exam.name.slice(0,50))}</text><text x="72" y="174" font-size="14">${esc(exam.classes?.length>1 ? exam.classes.length+' turmas' : (exam.class_name||'').slice(0,45))} · ${esc(exam.date)}</text><text x="72" y="204" font-size="14">${card.reusable?'Modelo reutilizável':'Conjunto'} ${card.booklet_id} · Folha ${card.page} de ${Math.ceil(questions.length/60)}</text></g><text x="72" y="244" font-size="16">Estudante / turma: ____________________________________</text><text x="72" y="274" font-size="13">Preencha toda a bolha com caneta de cor nítida. Uma alternativa por questão.</text><text x="72" y="294" font-size="12">Não dobre, rasure ou cubra as quatro marcas de referência. Imprima em tamanho real.</text>`;
  for(let i=0;i<card.question_count;i++){
    const num=card.start_number+i;const p=bubblePosition(i,0);
    svg+=`<text x="${p.x-40}" y="${p.y+4}" font-size="13" text-anchor="end">${num}</text>`;
    for(let a=0;a<exam.alternatives;a++){const b=bubblePosition(i,a);svg+=`<circle cx="${b.x}" cy="${b.y}" r="10" stroke="black" stroke-width="1.5" fill="white"/><text x="${b.x}" y="${b.y+4}" font-size="10" text-anchor="middle" fill="#777">${String.fromCharCode(65+a)}</text>`;}
  }
  svg+=`<text x="72" y="1044" font-size="11">Branco ou marcação múltipla: questão anulada para o estudante.</text><text x="72" y="1062" font-size="11">Use as páginas do mesmo modelo. Escreva nome e turma. O QR contém somente um código aleatório.</text></svg>`;return svg;
}
