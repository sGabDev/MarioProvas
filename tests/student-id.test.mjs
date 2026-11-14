import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {Resvg} from '@resvg/resvg-js';
import {cardSvg,identifiedLayout,identifiedA4Layout,bubblePosition,idBubblePosition} from '../public/assets/layout.mjs';
import {readCard} from '../public/assets/omr.mjs';
import {decodeQr} from '../public/assets/qr.mjs';
import {normalizedStudentId,suggestStudent} from '../public/assets/student-id.mjs';
const require=createRequire(import.meta.url),jsQR=require('../public/assets/vendor/jsQR.js'),qrcode=require('../public/assets/vendor/qrcode.js');
async function fixture(count,alternatives,digits,version=4){
    const layout=version===4?identifiedLayout(count,alternatives):identifiedA4Layout();
    const card={token:'a102c304e506a708b901c203d405e607a10',start_number:1,question_count:count,layoutVersion:version};
    const expected=Array.from({length:count},(_,i)=>[String.fromCharCode(65+i%alternatives)]);let marks='';
    function mark(p,radius=8.8){marks+=`<circle cx="${p.x}" cy="${p.y}" r="${radius}" fill="black"/>`;}
    expected.forEach((a,i)=>mark(bubblePosition(i,i%alternatives,layout)));
    digits.forEach((digits,col)=>digits.forEach(d=>mark(idBubblePosition(col,d==='~'?0:Number(d),layout),d==='~'?4:8.8)));
    const svg=cardSvg(card,{alternatives},[],qrcode).replace('</svg>',marks+'</svg>');
    const png=new Resvg(svg,{fitTo:{mode:'width',value:layout.width*2}}).render().asPng(),image=await loadImage(png);
    const canvas=createCanvas(layout.width,layout.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),qr=decodeQr(pixels,jsQR);assert.ok(qr);
    const result=readCard(pixels,qr,count,alternatives);assert.deepEqual(result.answers,expected);
    return {result,png};
}
for(const [count,alternatives,version] of [[1,2,4],[8,5,4],[60,5,4],[37,3,4],[60,5,5]])test(`ID de seis dígitos: ${count} questões/${alternatives} alternativas/formato ${version}`,async()=>{
    const {result,png}=await fixture(count,alternatives,[['0'],['0'],['1'],['2'],['3'],['4']],version);
    assert.equal(result.studentId.status,'recognized');assert.equal(result.studentId.value,'001234');assert.equal(result.studentId.scores.length,6);
    if(count===8||version===5)fs.writeFileSync(`tests/artifacts/id-${version}.png`,png);
});
test('ID zero é válido e falhas de identificação preservam a leitura das respostas',async()=>{
    assert.equal((await fixture(8,5,Array.from({length:6},()=>['0']))).result.studentId.value,'000000');
    for(const [digits,status] of [[Array.from({length:6},()=>[]),'blank'],[[['1'],[],['3'],['4'],['5'],['6']],'incomplete'],[[['1','2'],['2'],['3'],['4'],['5'],['6']],'multiple']]){
        const {result}=await fixture(8,5,digits);assert.equal(result.studentId.status,status);assert.equal(result.studentId.value,null);
    }
    assert.equal((await fixture(8,5,[['~'],['2'],['3'],['4'],['5'],['6']])).result.studentId.status,'ambiguous');
});
test('matrícula exige correspondência única e respeita zeros e alunos disponíveis',()=>{
    assert.equal(normalizedStudentId(' 123 '),'000123');assert.equal(normalizedStudentId('000000'),'000000');
    for(const value of ['1234567','AL123','12.3','-123',''])assert.equal(normalizedStudentId(value),null);
    const a={id:1,external_id:'123'},b={id:2,external_id:'000123'},identity={status:'recognized',value:'000123'};
    assert.equal(suggestStudent(identity,[a],[a]).student.id,1);
    assert.equal(suggestStudent(identity,[a,b],[a,b]).status,'duplicate');
    assert.equal(suggestStudent(identity,[a],[]).status,'unavailable');
    assert.equal(suggestStudent(identity,[],[]).status,'not_found');
    assert.equal(suggestStudent({status:'blank'},[a],[a]).student,null);
});
