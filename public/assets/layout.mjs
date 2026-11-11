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
  if(typeof qrFactory!=='function')throw Error('Gerador de QR indisponível. Atualize a página e confira se todos os arquivos foram enviados.');
  if(card.layoutVersion===3)return compactCardSvg(card,exam,questions,qrFactory);
  const qr=qrFactory(0,'M');qr.addData(card.token);qr.make();const n=qr.getModuleCount(),geometry=QR_LAYOUTS[card.layoutVersion===1?1:0];const mod=geometry.size/n;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1120" role="img" aria-label="Cartão-resposta" style="font-family:Arial,sans-serif"><rect width="800" height="1120" fill="white"/><g fill="black">`;
  for(const p of LAYOUT.markers)svg+=`<rect x="${p.x-10}" y="${p.y-10}" width="20" height="20"/>`;
  svg+=`</g><rect x="${geometry.x-4*mod}" y="${geometry.y-4*mod}" width="${geometry.size+8*mod}" height="${geometry.size+8*mod}" fill="white"/><g fill="black">`;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))svg+=`<rect x="${geometry.x+x*mod}" y="${geometry.y+y*mod}" width="${mod+.015}" height="${mod+.015}"/>`;
  svg+='</g>';
  for(let i=0;i<card.question_count;i++){
    const num=card.start_number+i;const p=bubblePosition(i,0);
    svg+=`<text x="${p.x-40}" y="${p.y+4}" font-size="13" text-anchor="end">${num}</text>`;
    for(let a=0;a<exam.alternatives;a++){const b=bubblePosition(i,a);svg+=`<circle cx="${b.x}" cy="${b.y}" r="10" stroke="black" stroke-width="1.5" fill="white"/><text x="${b.x}" y="${b.y+4}" font-size="10" text-anchor="middle" fill="#777">${String.fromCharCode(65+a)}</text>`;}
  }
  svg+='</svg>';return svg;
}
function compactCardSvg(card,exam,questions,qrFactory){
  const l=compactLayout(Number(card.question_count),Number(exam.alternatives)),qr=qrFactory(0,'M');qr.addData(card.token);qr.make();
  const n=qr.getModuleCount(),mod=l.qr.size/n,q=l.qr;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.width} ${l.height}" width="${l.widthMm}mm" height="${l.heightMm}mm" role="img" aria-label="Cartão-resposta compacto" style="font-family:Arial,sans-serif"><rect width="${l.width}" height="${l.height}" fill="white"/><g fill="black">`;
  for(const p of l.markers)svg+=`<rect x="${p.x-10}" y="${p.y-10}" width="20" height="20"/>`;
  svg+=`</g><rect x="${q.x-4*mod}" y="${q.y-4*mod}" width="${q.size+8*mod}" height="${q.size+8*mod}" fill="white"/><g fill="black">`;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))svg+=`<rect x="${q.x+x*mod}" y="${q.y+y*mod}" width="${mod+.015}" height="${mod+.015}"/>`;
  svg+='</g>';
  for(let i=0;i<card.question_count;i++){
    const p=bubblePosition(i,0,l);svg+=`<text x="${p.x-23}" y="${p.y+4}" font-size="12" text-anchor="end">${card.start_number+i}</text>`;
    for(let a=0;a<exam.alternatives;a++){const b=bubblePosition(i,a,l);svg+=`<circle cx="${b.x}" cy="${b.y}" r="10" stroke="black" stroke-width="1.5" fill="white"/><text x="${b.x}" y="${b.y+3.5}" font-size="9" text-anchor="middle" fill="#aaa">${String.fromCharCode(65+a)}</text>`;}
  }
  svg+='</svg>';
  return svg;
}
