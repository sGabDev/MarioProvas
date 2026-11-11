// Referências são quadriláteros sólidos. O limiar é relativo à vizinhança,
// para aceitar a mesma impressão sob diferentes exposições e sombras.
function signedArea(points){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p.x*q.y-p.y*q.x;}return a/2;}
function cross(o,a,b){return (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);}
function hull(points){
    points.sort((a,b)=>a.x-b.x||a.y-b.y);const lower=[],upper=[];
    for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    lower.pop();upper.pop();return lower.concat(upper);
}
function simplifyQuad(points){
    const p=points.slice();while(p.length>4){let smallest=Infinity,index=-1;
        for(let i=0;i<p.length;i++){const loss=Math.abs(cross(p[(i+p.length-1)%p.length],p[i],p[(i+1)%p.length]));if(loss<smallest){smallest=loss;index=i;}}
        p.splice(index,1);
    }return p;
}
function diagonalCenter(q){
    const a=q[0],b=q[2],c=q[1],d=q[3],rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-6)return null;const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den;return {x:a.x+t*rx,y:a.y+t*ry};
}
export function findFiducials(gray,width,height){
    const scale=Math.min(1,1100/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale),sx=width/w,sy=height/h,small=new Uint8Array(w*h);
    for(let y=0;y<h;y++){const row=Math.min(height-1,Math.floor((y+.5)*sy))*width;for(let x=0;x<w;x++)small[y*w+x]=gray[row+Math.min(width-1,Math.floor((x+.5)*sx))];}
    const stride=w+1,integral=new Uint32Array((w+1)*(h+1));
    for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=small[y*w+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;}}
    const radius=Math.max(12,Math.round(Math.min(w,h)*.027)),mask=new Uint8Array(w*h);
    for(let y=0;y<h;y++){const top=Math.max(0,y-radius),bottom=Math.min(h,y+radius+1);
        for(let x=0;x<w;x++){const left=Math.max(0,x-radius),right=Math.min(w,x+radius+1),mean=(integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left])/((right-left)*(bottom-top));
            if(small[y*w+x]<mean-Math.max(9,mean*.12))mask[y*w+x]=1;
        }
    }
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),candidates=[];
    for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
        let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0;queue[0]=i;seen[i]=1;
        while(head<tail){const p=queue[head++],x=p%w,y=(p/w)|0;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
            if(x>0&&mask[p-1]&&!seen[p-1]){seen[p-1]=1;queue[tail++]=p-1;}
            if(x<w-1&&mask[p+1]&&!seen[p+1]){seen[p+1]=1;queue[tail++]=p+1;}
            if(y>0&&mask[p-w]&&!seen[p-w]){seen[p-w]=1;queue[tail++]=p-w;}
            if(y<h-1&&mask[p+w]&&!seen[p+w]){seen[p+w]=1;queue[tail++]=p+w;}
        }
        const bw=maxX-minX+1,bh=maxY-minY+1,fill=tail/(bw*bh);
        if(tail<10||bw<3||bh<3||bw>w*.13||bh>h*.13||bw/bh<.22||bw/bh>4.5||fill<.38)continue;
        const boundary=[];
        for(let k=0;k<tail;k++){const p=queue[k],x=p%w,y=(p/w)|0;if(x===0||y===0||x===w-1||y===h-1||!mask[p-1]||!mask[p+1]||!mask[p-w]||!mask[p+w])boundary.push({x,y});}
        if(boundary.length<4)continue;const polygon=hull(boundary);if(polygon.length<4)continue;
        const quad=simplifyQuad(polygon),hullArea=Math.abs(signedArea(polygon)),quadArea=Math.abs(signedArea(quad)),square=quadArea/Math.max(1,hullArea),solid=tail/Math.max(1,hullArea);
        // Bolhas preenchidas são discos; não podem se tornar referências.
        if(square<.75||solid<.73)continue;
        const center=diagonalCenter(quad);if(!center)continue;
        candidates.push({x:(center.x+.5)*sx-.5,y:(center.y+.5)*sy-.5,width:bw*sx,height:bh*sy,fill,square,solid:Math.min(1,solid),corners:quad.map(p=>({x:(p.x+.5)*sx-.5,y:(p.y+.5)*sy-.5}))});
    }
    return candidates;
}
