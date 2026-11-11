import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {Resvg} from '@resvg/resvg-js';
import {cardSvg} from '../public/assets/layout.mjs';
import {homography,project,readCard} from '../public/assets/omr.mjs';
import {decodeQr} from '../public/assets/qr.mjs';
const require=createRequire(import.meta.url),jsQR=require('../public/assets/vendor/jsQR.js'),qrcode=require('../public/assets/vendor/qrcode.js');
const card={token:'c304e506a708b901c203d405e607a102c',page:1,start_number:1,question_count:60,booklet_id:1};
const exam={name:'VERIFICAÇÃO DE ALINHAMENTO',class_name:'',date:'',alternatives:5};
const expected=Array.from({length:60},(_,i)=>i===12?[]:i===37?['B','E']:[String.fromCharCode(65+i%5)]);
let marks='';expected.forEach((answers,i)=>answers.forEach(a=>marks+=`<circle cx="${116+Math.floor(i/20)*236+(a.charCodeAt(0)-65)*32}" cy="${328+i%20*34}" r="8.8" fill="black"/>`));
const svg=cardSvg(card,exam,Array.from({length:60},(_,i)=>({number:i+1})),qrcode).replace('</svg>',marks+'</svg>');
const sourceImage=await loadImage(new Resvg(svg,{fitTo:{mode:'width',value:1000}}).render().asPng()),sourceCanvas=createCanvas(1000,1400),sourceCtx=sourceCanvas.getContext('2d');sourceCtx.drawImage(sourceImage,0,0);
const source=sourceCtx.getImageData(0,0,1000,1400);
function photo({width=1280,height=960,corners,black=0,white=250,shadow=0,background=90,blur=0}){
    const canvas=createCanvas(width,height),ctx=canvas.getContext('2d'),image=ctx.createImageData(width,height),map=homography(corners,[{x:0,y:0},{x:1000,y:0},{x:1000,y:1400},{x:0,y:1400}]);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const p=project(map,x,y),out=(y*width+x)*4;let value=background;
        if(p.x>=0&&p.y>=0&&p.x<999&&p.y<1399){const ix=Math.floor(p.x),iy=Math.floor(p.y),dx=p.x-ix,dy=p.y-iy,k=(iy*1000+ix)*4;const gray=source.data[k]*(1-dx)*(1-dy)+source.data[k+4]*dx*(1-dy)+source.data[k+4000]*(1-dx)*dy+source.data[k+4004]*dx*dy;value=black+(white-black)*gray/255;value-=shadow*(p.y/1400)*(.25+.75*p.x/1000);}
        image.data[out]=image.data[out+1]=image.data[out+2]=Math.max(0,Math.min(255,value));image.data[out+3]=255;
    }
    ctx.putImageData(image,0,0);
    if(blur){const copy=createCanvas(width,height);copy.getContext('2d').drawImage(canvas,0,0);ctx.filter=`blur(${blur}px)`;ctx.drawImage(copy,0,0);}
    return {canvas,image:ctx.getImageData(0,0,width,height)};
}
const cases=[
    ['perspectiva inclinada com folha inteira',{corners:[{x:350,y:30},{x:1100,y:110},{x:870,y:920},{x:130,y:740}]}],
    ['tinta impressa cinza acima do limiar antigo',{black:135,corners:[{x:380,y:35},{x:990,y:70},{x:1020,y:925},{x:280,y:870}]}],
    ['sombra gradual e fundo escuro',{black:35,white:245,shadow:90,corners:[{x:290,y:35},{x:1020,y:100},{x:1080,y:900},{x:180,y:845}]}],
    ['câmera 800 por 600 com quatro referências pequenas',{width:800,height:600,corners:[{x:230,y:18},{x:575,y:40},{x:600,y:580},{x:162,y:550}]}],
    ['perspectiva com base estreita',{corners:[{x:170,y:55},{x:1100,y:50},{x:890,y:920},{x:420,y:875}]}],
];
fs.mkdirSync('tests/artifacts',{recursive:true});
for(const [name,settings] of cases)test(`registro: ${name}`,()=>{
    const {canvas,image}=photo(settings),qr=decodeQr(image,jsQR);assert.ok(qr,'O QR da cena precisa estar legível');
    try{const result=readCard(image,qr,60,5);assert.deepEqual(result.answers,expected);}
    catch(error){fs.writeFileSync('tests/artifacts/registro-falha-'+cases.findIndex(c=>c[0]===name)+'.png',canvas.toBuffer('image/png'));throw error;}
});
test('baixa resolução informa bolhas pequenas, preservando o alinhamento e impedindo gravação insegura',()=>{
    const {image}=photo({width:640,height:480,corners:[{x:185,y:14},{x:460,y:32},{x:480,y:464},{x:130,y:440}]});
    const qr=decodeQr(image,jsQR);assert.ok(qr);
    assert.throws(()=>readCard(image,qr,60,5),error=>error.code==='resolution'&&error.details.markers.length===4&&/resolução maior/.test(error.message));
});
test('cada referência é obrigatória: letras e bolhas preenchidas não substituem quadrados ausentes',()=>{
    for(const [x,y] of [[50,50],[950,50],[950,1350],[50,1350]]){
        const c=createCanvas(1000,1400),ctx=c.getContext('2d');ctx.drawImage(sourceImage,0,0);ctx.fillStyle='white';ctx.fillRect(x-20,y-20,40,40);
        const image=ctx.getImageData(0,0,1000,1400),qr=decodeQr(image,jsQR);assert.ok(qr);
        assert.throws(()=>readCard(image,qr,60,5),e=>e.code==='frame');
    }
});
test('pequeno ruído nos cantos do QR não impede a busca das referências distantes',()=>{
    const {image}=photo(cases[0][1]),qr=decodeQr(image,jsQR);assert.ok(qr);
    qr.location.bottomRightCorner.x+=3;qr.location.bottomRightCorner.y-=2;
    assert.deepEqual(readCard(image,qr,60,5).answers,expected);
});
