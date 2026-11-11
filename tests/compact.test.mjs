import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {Resvg} from '@resvg/resvg-js';
import {cardSvg,compactLayout,bubblePosition} from '../public/assets/layout.mjs';
import {readCard,homography,project} from '../public/assets/omr.mjs';
import {decodeQr} from '../public/assets/qr.mjs';
import {cardPng,withPrintDpi} from '../public/assets/png-export.mjs';
const require=createRequire(import.meta.url),jsQR=require('../public/assets/vendor/jsQR.js'),qrcode=require('../public/assets/vendor/qrcode.js');
fs.mkdirSync('tests/artifacts',{recursive:true});
function fixture(count=60,alternatives=5,filled=true){
    const layout=compactLayout(count,alternatives),card={token:'a102c304e506a708b901c203d405e607a10',page:1,start_number:1,question_count:count,booklet_id:1,layoutVersion:3};
    const expected=Array.from({length:count},(_,i)=>!filled||i===7?[]:i===12?['A','B']:[String.fromCharCode(65+i%alternatives)]);
    let marks='';expected.forEach((answers,i)=>answers.forEach(a=>{const p=bubblePosition(i,a.charCodeAt(0)-65,layout);marks+=`<circle cx="${p.x}" cy="${p.y}" r="8.8" fill="black"/>`;}));
    const svg=cardSvg(card,{name:'VERIFICAÇÃO DO CARTÃO COMPACTO',alternatives},Array.from({length:count},(_,i)=>({number:i+1})),qrcode).replace('</svg>',marks+'</svg>');
    const png=new Resvg(svg,{fitTo:{mode:'width',value:layout.width*2}}).render().asPng();
    return {layout,card,expected,svg,png};
}
async function pixels(png,width){
    const image=await loadImage(png),w=width||image.width,h=Math.round(image.height*w/image.width),canvas=createCanvas(w,h),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,w,h);return {canvas,image:ctx.getImageData(0,0,w,h)};
}
function recognize(image){const qr=decodeQr(image,jsQR);assert.ok(qr,'QR impresso deve ser reconhecido');return qr;}
test('compacto preserva bolhas de 4 mm, margens e todas as questões sem sobreposição',()=>{
    for(let count=1;count<=60;count++)for(let alternatives=2;alternatives<=5;alternatives++){
        const l=compactLayout(count,alternatives);assert.ok(l.grid.rows<=15);assert.ok(l.widthMm<=160&&l.heightMm<=118.01);
        for(let i=0;i<count;i++)for(let a=0;a<alternatives;a++){
            const p=bubblePosition(i,a,l);assert.ok(Math.abs(2*p.r*l.widthMm/l.width-4)<1e-10);
            assert.ok(p.x-15>30&&p.x+15<l.width-30&&p.y-10>l.qr.y+l.qr.size+15&&p.y+15<l.height-22);
        }
    }
    assert.equal(compactLayout(30).widthMm,86.4);assert.equal(compactLayout(60).widthMm,160);
});
for(const [count,alternatives] of [[1,5],[10,5],[30,5],[45,5],[60,5],[60,2],[37,3],[22,4]])test(`leitura compacta: ${count} questões, ${alternatives} alternativas`,async()=>{
    const f=fixture(count,alternatives),{image}=await pixels(f.png,f.layout.width),result=readCard(image,recognize(image),count,alternatives);
    assert.equal(result.layout.format,'compact');assert.deepEqual(result.answers,f.expected);assert.equal(result.normalized.length,f.layout.width*f.layout.height);
    if([10,30,60].includes(count)&&alternatives===5)fs.writeFileSync(`tests/artifacts/compacto-${count}.png`,fixture(count,alternatives,false).png);
});
test('compacto inserido em capa com textos e perspectiva é lido sem enquadrar a folha inteira',async()=>{
    const f=fixture(),source=(await pixels(f.png,f.layout.width)).image,w=1000,h=1400,c=createCanvas(w,h),ctx=c.getContext('2d');
    ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.fillStyle='black';ctx.font='35px Arial';ctx.fillText('VERIFICAÇÃO DA CAPA',100,150);ctx.font='20px Arial';ctx.fillText('Texto externo ao cartão',100,230);ctx.fillRect(80,300,20,20);ctx.fillRect(880,300,20,20);
    const out=ctx.getImageData(0,0,w,h),corners=[{x:110,y:620},{x:870,y:670},{x:850,y:1250},{x:100,y:1160}],map=homography(corners,[{x:0,y:0},{x:f.layout.width,y:0},{x:f.layout.width,y:f.layout.height},{x:0,y:f.layout.height}]);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const p=project(map,x,y);if(p.x<0||p.y<0||p.x>=source.width-1||p.y>=source.height-1)continue;
        const ix=Math.floor(p.x),iy=Math.floor(p.y),dx=p.x-ix,dy=p.y-iy,k=(iy*source.width+ix)*4,o=(y*w+x)*4;
        const v=source.data[k]*(1-dx)*(1-dy)+source.data[k+4]*dx*(1-dy)+source.data[k+source.width*4]*(1-dx)*dy+source.data[k+source.width*4+4]*dx*dy;
        out.data[o]=out.data[o+1]=out.data[o+2]=v;
    }
    ctx.putImageData(out,0,0);fs.writeFileSync('tests/artifacts/compacto-na-capa.png',c.toBuffer('image/png'));
    assert.deepEqual(readCard(out,recognize(out),60,5).answers,f.expected);
    const small=fixture(10),cover=createCanvas(w,h),coverCtx=cover.getContext('2d');coverCtx.fillStyle='white';coverCtx.fillRect(0,0,w,h);coverCtx.drawImage(await loadImage(small.png),120,600,small.layout.width,small.layout.height);
    const distant=coverCtx.getImageData(0,0,w,h);assert.throws(()=>readCard(distant,recognize(distant),10,5),error=>error.code==='distance'&&/Aproxime o cartão inteiro/.test(error.message));
});
test('compacto: impressão acinzentada e rotação continuam legíveis',async()=>{
    const f=fixture(),{canvas,image}=await pixels(f.png,f.layout.width);
    for(let i=0;i<image.data.length;i+=4)for(let c=0;c<3;c++)image.data[i+c]=135+image.data[i+c]*115/255;
    canvas.getContext('2d').putImageData(image,0,0);const c=createCanvas(image.height,image.width),ctx=c.getContext('2d');ctx.translate(image.height,0);ctx.rotate(Math.PI/2);ctx.drawImage(canvas,0,0);
    const photo=ctx.getImageData(0,0,c.width,c.height);assert.deepEqual(readCard(photo,recognize(photo),60,5).answers,f.expected);
});
test('PNG real de 300/600 dpi mantém proporção, tamanho físico, fundo branco e QR legível',async()=>{
    const oldDocument=globalThis.document,oldImage=globalThis.Image;
    globalThis.document={createElement:()=>{const c=createCanvas(1,1);c.toBlob=callback=>callback(new Blob([c.toBuffer('image/png')],{type:'image/png'}));return c;}};
    globalThis.Image=class{set src(url){fetch(url).then(r=>r.arrayBuffer()).then(b=>loadImage(Buffer.from(b))).then(image=>{this.image=image;this.onload();},()=>this.onerror());}};
    const originalCreate=globalThis.document.createElement;
    globalThis.document.createElement=()=>{const c=originalCreate(),ctx=c.getContext('2d'),draw=ctx.drawImage.bind(ctx);ctx.drawImage=(image,...args)=>draw(image.image,...args);c.getContext=()=>ctx;return c;};
    try{
        const f=fixture(30,5,false);
        for(const dpi of [300,600]){
            const blob=await cardPng(f.svg,f.layout,dpi),bytes=new Uint8Array(await blob.arrayBuffer()),loaded=await loadImage(Buffer.from(bytes));
            assert.equal(loaded.width,Math.round(f.layout.widthMm/25.4*dpi));assert.equal(loaded.height,Math.round(f.layout.heightMm/25.4*dpi));
            const offset=Buffer.from(bytes).indexOf('pHYs'),view=new DataView(bytes.buffer,bytes.byteOffset+offset+4,9);
            assert.equal(view.getUint32(0),Math.round(dpi/.0254));assert.equal(view.getUint32(4),Math.round(dpi/.0254));assert.equal(view.getUint8(8),1);
            const {image}=await pixels(Buffer.from(bytes),f.layout.width);const result=readCard(image,recognize(image),30,5);assert.deepEqual(result.answers,f.expected);
            const changed=withPrintDpi(bytes,dpi===300?600:300);assert.equal(Buffer.from(changed).indexOf('pHYs'),Buffer.from(changed).lastIndexOf('pHYs'));
            if(dpi===300)fs.writeFileSync('tests/artifacts/compacto-30-exportado-300dpi.png',bytes);
        }
    }finally{globalThis.document=oldDocument;globalThis.Image=oldImage;}
});
