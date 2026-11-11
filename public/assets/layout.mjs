export const QR_LAYOUTS=Object.freeze([{x:580,y:72,size:160},{x:600,y:88,size:132}]);
export const LAYOUT = Object.freeze({format:'a4',width:800,height:1120,widthMm:190,heightMm:266,markers:[{x:40,y:40},{x:760,y:40},{x:760,y:1080},{x:40,y:1080}],markerSize:20,qr:QR_LAYOUTS[0],perPage:60});
export function compactLayout(count,alternatives=5){
  if(!Number.isInteger(count)||count<1||count>60||!Number.isInteger(alternatives)||alternatives<2||alternatives>5)throw Error('Quantidade de questões ou alternativas inválida para o cartão.');
  const columnWidth=44+alternatives*28;let best=null;
  for(let columns=1;columns<=4;columns++){
    const rows=Math.ceil(count/columns);if(rows>15)continue;
    const width=Math.max(432,columns*columnWidth+64),height=156+(rows-1)*28+42;
    if(!best||width*height<best.width*best.height)best={columns,rows,width,height};
  }
  const {width,height,columns,rows}=best;
  return {format:'compact',width,height,widthMm:width*.2,heightMm:height*.2,markerSize:20,perPage:60,
    markers:[{x:20,y:20},{x:width-20,y:20},{x:width-20,y:height-20},{x:20,y:height-20}],qr:{x:width-152,y:18,size:104},
    grid:{columns,rows,columnWidth,offsetX:(width-columns*columnWidth-64)/2,top:156,pitch:28}};
}
export function bubblePosition(index,alternative,layout=LAYOUT){
  if(layout.grid){const g=layout.grid;return {x:78+g.offsetX+Math.floor(index/g.rows)*g.columnWidth+alternative*28,y:g.top+(index%g.rows)*g.pitch,r:10};}
  return {x:116+Math.floor(index/20)*236+alternative*32,y:328+(index%20)*34,r:10};
}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function cardSvg(card,exam,questions,qrFactory){
  if(card.layoutVersion===3)return compactCardSvg(card,exam,questions,qrFactory);
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
function compactCardSvg(card,exam,questions,qrFactory){
  const l=compactLayout(Number(card.question_count),Number(exam.alternatives)),qr=qrFactory(0,'M');qr.addData(card.token);qr.make();
  const n=qr.getModuleCount(),mod=l.qr.size/n,q=l.qr,clip=`compact-${card.token}`;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.width} ${l.height}" width="${l.widthMm}mm" height="${l.heightMm}mm" role="img" aria-label="Cartão-resposta compacto" style="font-family:Arial,sans-serif"><rect width="${l.width}" height="${l.height}" fill="white"/><g fill="black">`;
  for(const p of l.markers)svg+=`<rect x="${p.x-10}" y="${p.y-10}" width="20" height="20"/>`;
  svg+=`</g><rect x="${q.x-4*mod}" y="${q.y-4*mod}" width="${q.size+8*mod}" height="${q.size+8*mod}" fill="white"/><g fill="black">`;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))svg+=`<rect x="${q.x+x*mod}" y="${q.y+y*mod}" width="${mod+.015}" height="${mod+.015}"/>`;
  svg+=`</g><defs><clipPath id="${clip}"><rect x="44" y="30" width="${l.width-212}" height="105"/></clipPath></defs><g clip-path="url(#${clip})"><text x="44" y="45" font-size="18" font-weight="bold">MarioProvas</text><text x="44" y="65" font-size="12">${escapeHtml(exam.name)}</text><text x="44" y="84" font-size="11">Q${card.start_number}–${card.start_number+card.question_count-1} · Bloco ${card.page}/${Math.ceil(questions.length/60)}</text><text x="44" y="105" font-size="11">Aluno: _________________________</text><text x="44" y="126" font-size="10">Preencha toda a bolha. Uma por questão.</text></g>`;
  for(let i=0;i<card.question_count;i++){
    const p=bubblePosition(i,0,l);svg+=`<text x="${p.x-23}" y="${p.y+4}" font-size="12" text-anchor="end">${card.start_number+i}</text>`;
    for(let a=0;a<exam.alternatives;a++){const b=bubblePosition(i,a,l);svg+=`<circle cx="${b.x}" cy="${b.y}" r="10" stroke="black" stroke-width="1.5" fill="white"/><text x="${b.x}" y="${b.y+3.5}" font-size="9" text-anchor="middle" fill="#aaa">${String.fromCharCode(65+a)}</text>`;}
  }
  svg+=`<text x="44" y="${l.height-16}" font-size="9">Branco ou múltiplas: questão anulada.</text></svg>`;
  return svg;
}
