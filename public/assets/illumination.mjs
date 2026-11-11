// Calibração fotométrica pelos próprios quadrados pretos e papel branco.
// O ganho é aplicado aos pixels, antes da leitura; não é um filtro da prévia.
export function normalizeIllumination(raw,layout){
    const samples=[];
    for(const m of layout.markers){
        let black=0,white=0,bn=0,wn=0;
        for(let dy=-16;dy<=16;dy++)for(let dx=-16;dx<=16;dx++){
            const v=raw[(m.y+dy)*layout.width+m.x+dx];
            if(Math.abs(dx)<6&&Math.abs(dy)<6){black+=v;bn++;}
            else if(Math.abs(dx)>13||Math.abs(dy)>13){white+=v;wn++;}
        }
        samples.push({black:black/bn,white:white/wn});
    }
    const contrast=Math.min(...samples.map(s=>s.white-s.black));
    if(contrast<30)return {normalized:null,rawContrast:contrast};
    const output=new Uint8Array(raw.length),left=layout.markers[0].x,top=layout.markers[0].y,width=layout.markers[1].x-left,height=layout.markers[3].y-top;
    const horizontal=new Float64Array(layout.width);
    for(let x=0;x<layout.width;x++)horizontal[x]=Math.max(0,Math.min(1,(x-left)/width));
    for(let y=0,i=0;y<layout.height;y++){
        const v=Math.max(0,Math.min(1,(y-top)/height));
        const blackLeft=samples[0].black*(1-v)+samples[3].black*v,blackRight=samples[1].black*(1-v)+samples[2].black*v;
        const whiteLeft=samples[0].white*(1-v)+samples[3].white*v,whiteRight=samples[1].white*(1-v)+samples[2].white*v;
        for(let x=0;x<layout.width;x++,i++){
            const u=horizontal[x],black=blackLeft+(blackRight-blackLeft)*u,white=whiteLeft+(whiteRight-whiteLeft)*u;
            output[i]=Math.max(0,Math.min(255,(raw[i]-black)*255/(white-black)));
        }
    }
    return {normalized:output,rawContrast:contrast};
}
