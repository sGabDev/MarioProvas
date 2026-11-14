import './vendor/jsQR.js';
import {decodeQr} from './qr.mjs?v=ui9';
import {readCard} from './omr.mjs?v=id1';
let currentImage=null,currentQr=null;
self.onmessage=event=>{
    const {id,type,image,options,count,alternatives}=event.data;
    try{
        const started=performance.now();let value;
        if(type==='decode'){
            currentImage=image;currentQr=decodeQr(image,self.jsQR,options);value=currentQr;
        }else if(type==='read'){
            if(!currentImage||!currentQr)throw Error('Capture o cartão novamente.');
            value=readCard(currentImage,currentQr,count,alternatives);
            value.durationMs=performance.now()-started;
        }else throw Error('Operação óptica inválida.');
        self.postMessage({id,value},value?.normalized?[value.normalized.buffer]:[]);
    }catch(error){self.postMessage({id,error:{message:error.message,code:error.code||'reader',details:error.details}});}
};
