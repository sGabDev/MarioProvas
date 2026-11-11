import {decodeQr} from './qr.mjs?v=assessment8';
import {readCard} from './omr.mjs?v=assessment8';

export function createScanEngine(){
    let worker=null,pending=new Map(),serial=0,lastImage=null,lastQr=null,disposed=false;
    const stopWorker=()=>{worker?.terminate();worker=null;for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('Processamento reiniciado.'));}pending.clear();};
    if(typeof Worker!=='undefined'){
        try{
            worker=new Worker(new URL('./scan-worker.mjs?v=assessment8',import.meta.url),{type:'module'});
            worker.onmessage=event=>{const task=pending.get(event.data.id);if(!task)return;pending.delete(event.data.id);clearTimeout(task.timer);if(event.data.error){const e=Error(event.data.error.message);e.code=event.data.error.code;e.details=event.data.error.details;task.reject(e);}else task.resolve(event.data.value);};
            worker.onerror=()=>stopWorker();
        }catch{worker=null;}
    }
    const request=(message)=>new Promise((resolve,reject)=>{
        const id=++serial,timer=setTimeout(()=>{const task=pending.get(id);pending.delete(id);task?.reject(Error('Processamento demorou. Reenquadre o cartão.'));stopWorker();},5000);
        pending.set(id,{resolve,reject,timer});try{worker.postMessage({...message,id});}catch(e){pending.delete(id);clearTimeout(timer);reject(e);stopWorker();}
    });
    return {
        get background(){return !!worker;},
        async decode(image,options={}){
            if(disposed)throw Error('Leitor encerrado.');lastImage={data:image.data,width:image.width,height:image.height};
            if(worker){try{lastQr=await request({type:'decode',image:lastImage,options});return lastQr;}catch(e){if(e.code)throw e;stopWorker();}}
            lastQr=decodeQr(image,globalThis.jsQR||globalThis.window?.jsQR,options);return lastQr;
        },
        async read(count,alternatives){
            if(disposed||!lastImage||!lastQr)throw Error('Capture o cartão novamente.');
            if(worker){try{return await request({type:'read',count,alternatives});}catch(e){if(e.code)throw e;stopWorker();}}
            const started=performance.now(),reading=readCard(lastImage,lastQr,count,alternatives);reading.durationMs=performance.now()-started;return reading;
        },
        dispose(){disposed=true;stopWorker();lastImage=null;lastQr=null;},
    };
}
