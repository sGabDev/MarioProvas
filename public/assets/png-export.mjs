// pHYs registra o tamanho de impressão. O PNG continua com fundo branco,
// margem do QR e quatro referências, sem depender de serviços externos.
function crc32(bytes){
    let crc=0xffffffff;
    for(const byte of bytes){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    return (crc^0xffffffff)>>>0;
}
export function withPrintDpi(bytes,dpi=300){
    if(!(bytes instanceof Uint8Array)||bytes.length<33||bytes[0]!==137||String.fromCharCode(...bytes.subarray(1,4))!=='PNG')throw Error('Imagem PNG inválida.');
    if(![300,600].includes(dpi))throw Error('Escolha resolução de 300 ou 600 dpi.');
    const chunk=new Uint8Array(21),view=new DataView(chunk.buffer),ppm=Math.round(dpi/0.0254);
    view.setUint32(0,9);chunk.set([112,72,89,115],4);view.setUint32(8,ppm);view.setUint32(12,ppm);chunk[16]=1;view.setUint32(17,crc32(chunk.subarray(4,17)));
    const parts=[bytes.subarray(0,8)];let inserted=false;
    for(let offset=8;offset<bytes.length;){
        if(offset+12>bytes.length)throw Error('PNG incompleto.');
        const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0),end=offset+length+12;
        if(end>bytes.length)throw Error('PNG incompleto.');
        const type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
        if(type!=='pHYs')parts.push(bytes.subarray(offset,end));
        if(type==='IHDR'){parts.push(chunk);inserted=true;}
        offset=end;
    }
    if(!inserted)throw Error('Cabeçalho PNG ausente.');
    const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;
    for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
export async function cardPng(svg,layout,dpi=300){
    if(![300,600].includes(dpi))throw Error('Escolha resolução de 300 ou 600 dpi.');
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(layout.widthMm/25.4*dpi);canvas.height=Math.round(layout.heightMm/25.4*dpi);
    // Rasteriza diretamente no tamanho final; evita ampliar um SVG que o
    // navegador tenha primeiro convertido usando seu tamanho intrínseco a 96 dpi.
    const source=svg.replace(/<svg\b[^>]*>/,root=>root.replace(/\s(?:width|height)="[^"]*"/g,'').replace(/>$/,` width="${canvas.width}" height="${canvas.height}">`));
    const image=new Image(),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));
    try{
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Não foi possível preparar o cartão.'));image.src=url;});
        const ctx=canvas.getContext('2d');if(!ctx)throw Error('Este navegador não oferece exportação de imagem.');
        ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Não foi possível gerar o PNG.');
        return new Blob([withPrintDpi(new Uint8Array(await blob.arrayBuffer()),dpi)],{type:'image/png'});
    }finally{URL.revokeObjectURL(url);canvas.width=canvas.height=0;}
}
