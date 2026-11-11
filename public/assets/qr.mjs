// Busca em duas escalas e recortes. As coordenadas sempre voltam à imagem original.
function crop(image,box,maxSide){
    const x=Math.max(0,Math.floor(box.x)),y=Math.max(0,Math.floor(box.y));
    const w=Math.min(image.width-x,Math.ceil(box.width)),h=Math.min(image.height-y,Math.ceil(box.height));
    if(w<24||h<24)return null;
    const scale=Math.min(1,maxSide/Math.max(w,h)),width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
    if(x===0&&y===0&&width===image.width&&height===image.height)return {data:image.data,width:image.width,height:image.height,originX:0,originY:0,scaleX:1,scaleY:1};
    const data=new Uint8ClampedArray(width*height*4),sx=w/width,sy=h/height;
    for(let j=0;j<height;j++){const sourceY=y+Math.min(h-1,Math.floor((j+.5)*sy));for(let i=0;i<width;i++){
        const p=(sourceY*image.width+x+Math.min(w-1,Math.floor((i+.5)*sx)))*4,k=(j*width+i)*4;
        data[k]=image.data[p];data[k+1]=image.data[p+1];data[k+2]=image.data[p+2];data[k+3]=255;
    }}
    return {data,width,height,originX:x,originY:y,scaleX:sx,scaleY:sy};
}
function mapped(qr,region){
    return {...qr,location:Object.fromEntries(Object.entries(qr.location).map(([name,p])=>[name,{x:p.x*region.scaleX+region.originX,y:p.y*region.scaleY+region.originY}]))};
}
export function qrBounds(qr,padding=.45){
    const p=['topLeftCorner','topRightCorner','bottomRightCorner','bottomLeftCorner'].map(k=>qr.location[k]);
    const xs=p.map(p=>p.x),ys=p.map(p=>p.y),width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys);
    return {x:Math.min(...xs)-width*padding,y:Math.min(...ys)-height*padding,width:width*(1+2*padding),height:height*(1+2*padding)};
}
function contrast(region){
    const data=new Uint8ClampedArray(region.data.length),hist=new Uint32Array(256);
    for(let i=0;i<region.data.length;i+=4)hist[(region.data[i]*77+region.data[i+1]*150+region.data[i+2]*29)>>8]++;
    let lo=0,hi=255,n=0;const total=region.width*region.height;
    for(let v=0;v<256;v++){n+=hist[v];if(n>=total*.03){lo=v;break;}}
    n=0;for(let v=255;v>=0;v--){n+=hist[v];if(n>=total*.03){hi=v;break;}}
    const gain=255/Math.max(20,hi-lo);
    for(let i=0;i<data.length;i+=4){const gray=(region.data[i]*77+region.data[i+1]*150+region.data[i+2]*29)>>8;data[i]=data[i+1]=data[i+2]=Math.max(0,Math.min(255,(gray-lo)*gain));data[i+3]=255;}
    return {...region,data};
}
export function decodeQr(image,decoder,{previous=null,hint=null,thorough=true}={}){
    if(typeof decoder!=='function')throw Error('Leitor QR indisponível. Atualize a página e tente novamente.');
    const decode=(region,invert=false)=>{if(!region)return null;const q=decoder(region.data,region.width,region.height,{inversionAttempts:invert?'attemptBoth':'dontInvert'});return q?mapped(q,region):null;};
    const whole={x:0,y:0,width:image.width,height:image.height};
    function* regions(){
        if(hint)yield crop(image,{x:hint.x-hint.width*.35,y:hint.y-hint.height*.35,width:hint.width*1.7,height:hint.height*1.7},1000);
        if(previous)yield crop(image,qrBounds(previous,.65),1000);
        yield crop(image,whole,1000);
        // Recortes extras são alocados apenas se a busca rápida falhar.
        if(thorough)yield crop(image,{x:0,y:0,width:image.width,height:image.height*.56},1300);
    }
    let result=null,precise=false;
    for(const region of regions()){result=decode(region)||(region&&(previous||hint||thorough)?decode(contrast(region),true):null);if(result){precise=region.scaleX===1&&region.scaleY===1;break;}}
    if(!result&&thorough){const full=crop(image,whole,1500);result=decode(full)||decode(contrast(full),true);}
    if(!result)return null;
    // Refina os cantos em resolução original: um erro pequeno no QR pode se
    // tornar grande ao estimar as referências na parte inferior da folha.
    return precise?result:(decode(crop(image,qrBounds(result,.45),1300))||result);
}
