import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createScanEngine} from '../public/assets/scan-engine.mjs';
const require=createRequire(import.meta.url);
const image=await loadImage('tests/artifacts/cartao-optico.png'),canvas=createCanvas(1000,1400),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
const pixels=ctx.getImageData(0,0,1000,1400);
const expected=Array.from({length:60},(_,i)=>i===5?[]:i===7?['A','D']:[String.fromCharCode(65+i%5)]);

test('worker real decodifica QR e bolhas sem executar o OMR na interface',async()=>{
    let messages=0;
    globalThis.Worker=class{
        constructor(){this.worker=new NodeWorker(new URL('./worker-harness.mjs',import.meta.url),{type:'module'});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
        postMessage(data){messages++;this.worker.postMessage(data);}
        terminate(){this.worker.terminate();}
    };
    const engine=createScanEngine();
    try{
        assert.equal(engine.background,true);const qr=await engine.decode(pixels);assert.match(qr.data,/^[a-f0-9]{32}$/);
        const result=await engine.read(60,5);assert.deepEqual(result.answers,expected);assert.ok(messages>=2);assert.equal(engine.background,true);
        assert.equal(result.normalized.length,800*1120);
    }finally{engine.dispose();delete globalThis.Worker;}
});
test('fallback funciona em navegador sem suporte a worker',async()=>{
    globalThis.jsQR=require('../public/assets/vendor/jsQR.js');const engine=createScanEngine();
    try{assert.equal(engine.background,false);const qr=await engine.decode(pixels);assert.ok(qr);assert.deepEqual((await engine.read(60,5)).answers,expected);}finally{engine.dispose();delete globalThis.jsQR;}
});
test('medição de tempo em capturas consecutivas com recorte do QR',async()=>{
    globalThis.jsQR=require('../public/assets/vendor/jsQR.js');const engine=createScanEngine(),samples=[];let previous=null;
    try{
        for(let i=0;i<8;i++){
            const start=performance.now();previous=await engine.decode(pixels,{previous,thorough:false});assert.ok(previous);const r=await engine.read(60,5);assert.deepEqual(r.answers,expected);samples.push({totalMs:performance.now()-start,omrMs:r.durationMs});
        }
        const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
        const report={resolution:'1000x1400',questions:60,samples,steadyMedianMs:median(samples.slice(2).map(s=>s.totalMs)),omrMedianMs:median(samples.slice(2).map(s=>s.omrMs))};
        fs.writeFileSync('tests/artifacts/benchmark-after.json',JSON.stringify(report,null,2));
        console.log(`Captura consecutiva: ${report.steadyMedianMs.toFixed(1)} ms; OMR: ${report.omrMedianMs.toFixed(1)} ms (medianas locais, imagem digital).`);
    }finally{engine.dispose();delete globalThis.jsQR;}
});
