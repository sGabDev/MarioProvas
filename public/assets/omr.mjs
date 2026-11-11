import { LAYOUT, QR_LAYOUTS, bubblePosition } from './layout.mjs?v=reader3';
export class ReadError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
export function homography(from, to) {
    const a = [];
    for (let i = 0; i < 4; i++) {
        const { x, y } = from[i],
            u = to[i].x,
            v = to[i].y;
        a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (let col = 0; col < 8; col++) {
        let pivot = col;
        for (let r = col + 1; r < 8; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
        if (Math.abs(a[pivot][col]) < 1e-9) throw new ReadError('alignment', 'Não foi possível alinhar o cartão.');
        [a[col], a[pivot]] = [a[pivot], a[col]];
        const n = a[col][col];
        for (let j = col; j <= 8; j++) a[col][j] /= n;
        for (let r = 0; r < 8; r++)
            if (r !== col) {
                const m = a[r][col];
                for (let j = col; j <= 8; j++) a[r][j] -= m * a[col][j];
            }
    }
    return [...a.map((r) => r[8]), 1];
}
export function project(h, x, y) {
    const z = h[6] * x + h[7] * y + h[8];
    return { x: (h[0] * x + h[1] * y + h[2]) / z, y: (h[3] * x + h[4] * y + h[5]) / z };
}
export function grayscale(image) {
    const g = new Uint8Array(image.width * image.height);
    for (let i = 0; i < g.length; i++)
        g[i] = (image.data[i * 4] * 77 + image.data[i * 4 + 1] * 150 + image.data[i * 4 + 2] * 29) >> 8;
    return g;
}
export function inkChannel(image) {
    const ink=new Uint8Array(image.width*image.height),data=image.data;
    // A tinta amarela quase some em luminância, mas absorve bastante azul.
    // O canal mais escuro preserva essa diferença também em vermelho/ciano.
    for(let i=0,p=0;i<ink.length;i++,p+=4){
        const min=Math.min(data[p],data[p+1],data[p+2]),max=Math.max(data[p],data[p+1],data[p+2]);
        ink[i]=Math.max(0,min-(max-min)*2.5);
    }
    return ink;
}
function warp(g,w,h,transform){
    const output=new Uint8Array(LAYOUT.width*LAYOUT.height),[a,b,c,d,e,f,j,k,l]=transform;
    for(let y=0,index=0;y<LAYOUT.height;y++){
        let nx=b*y+c,ny=e*y+f,z=k*y+l;
        for(let x=0;x<LAYOUT.width;x++,index++,nx+=a,ny+=d,z+=j){
            const px=nx/z,py=ny/z;
            if(px<0||py<0||px>=w-1||py>=h-1){output[index]=255;continue;}
            const ix=px|0,iy=py|0,dx=px-ix,dy=py-iy,p=iy*w+ix;
            output[index]=g[p]*(1-dx)*(1-dy)+g[p+1]*dx*(1-dy)+g[p+w]*(1-dx)*dy+g[p+w+1]*dx*dy;
        }
    }
    return output;
}
function referenceCandidates(g,w,h){
    const ratio=Math.min(1,1000/Math.max(w,h));
    if(ratio===1)return components(g,w,h);
    const width=Math.round(w*ratio),height=Math.round(h*ratio),small=new Uint8Array(width*height),sx=w/width,sy=h/height;
    for(let y=0;y<height;y++){const row=Math.min(h-1,Math.floor((y+.5)*sy))*w;for(let x=0;x<width;x++)small[y*width+x]=g[row+Math.min(w-1,Math.floor((x+.5)*sx))];}
    return components(small,width,height).map(p=>({...p,x:(p.x+.5)*sx-.5,y:(p.y+.5)*sy-.5,width:p.width*sx,height:p.height*sy}));
}
function components(g, w, h) {
    const seen = new Uint8Array(g.length),
        stack = new Int32Array(g.length);
    const candidates = [];
    for (let i = 0; i < g.length; i++)
        if (!seen[i] && g[i] < 100) {
            let head = 0,
                tail = 1;
            stack[0] = i;
            seen[i] = 1;
            let minX = w,
                minY = h,
                maxX = 0,
                maxY = 0,
                sumX = 0,
                sumY = 0,
                count = 0;
            while (head < tail) {
                const p = stack[head++],
                    x = p % w,
                    y = (p / w) | 0;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                sumX += x;
                sumY += y;
                count++;
                if(x>0&&!seen[p-1]&&g[p-1]<100){seen[p-1]=1;stack[tail++]=p-1;}
                if(x<w-1&&!seen[p+1]&&g[p+1]<100){seen[p+1]=1;stack[tail++]=p+1;}
                if(y>0&&!seen[p-w]&&g[p-w]<100){seen[p-w]=1;stack[tail++]=p-w;}
                if(y<h-1&&!seen[p+w]&&g[p+w]<100){seen[p+w]=1;stack[tail++]=p+w;}
            }
            const bw = maxX - minX + 1,
                bh = maxY - minY + 1;
            if (
                bw >= 6 &&
                bh >= 6 &&
                bw < w * 0.12 &&
                bh < h * 0.12 &&
                bw / bh > 0.4 &&
                bw / bh < 2.5 &&
                count / (bw * bh) > 0.46
            )
                candidates.push({ x: sumX / count, y: sumY / count, width: bw, height: bh, fill: count / (bw * bh) });
        }
    return candidates;
}
function area(p) {
    return Math.abs(p.reduce((s, a, i) => s + a.x * p[(i + 1) % 4].y - a.y * p[(i + 1) % 4].x, 0)) / 2;
}
function qrPoints(loc) {
    return [loc.topLeftCorner, loc.topRightCorner, loc.bottomRightCorner, loc.bottomLeftCorner];
}
function locateReferences(cand,w,h,qr,q){
    const qrModel=[{x:q.x,y:q.y},{x:q.x+q.size,y:q.y},{x:q.x+q.size,y:q.y+q.size},{x:q.x,y:q.y+q.size}],detected=qrPoints(qr.location);
    const estimate=homography(qrModel,detected),predicted=LAYOUT.markers.map(p=>project(estimate,p.x,p.y)),choices=[];
    // A aproximação afim não amplifica o ruído de um canto do QR ao longo
    // de toda a folha. A perspectiva real é calculada depois pelas marcas.
    const affine=(x,y)=>({x:detected[0].x+(detected[1].x-detected[0].x)*(x-q.x)/q.size+(detected[3].x-detected[0].x)*(y-q.y)/q.size,y:detected[0].y+(detected[1].y-detected[0].y)*(x-q.x)/q.size+(detected[3].y-detected[0].y)*(y-q.y)/q.size});
    for(let i=0;i<4;i++){
        const p=predicted[i],origin=LAYOUT.markers[i],ap=affine(origin.x,origin.y),edge=affine(origin.x+20,origin.y),expected=Math.hypot(edge.x-ap.x,edge.y-ap.y),options=[];
        for(let k=0;k<cand.length;k++){
            const c=cand[k],distance=Math.min(Math.hypot(c.x-p.x,c.y-p.y),Math.hypot(c.x-ap.x,c.y-ap.y)),ratio=Math.sqrt(c.width*c.height)/expected;
            if(distance>Math.max(28,Math.hypot(w,h)*.18)||ratio<.4||ratio>2.2)continue;
            options.push({...c,k,cost:distance+Math.abs(Math.log(ratio))*35+(1-c.fill)*90});
        }
        options.sort((a,b)=>a.cost-b.cost);if(!options.length)return null;choices.push(options.slice(0,8));
    }
    let found=null,bestError=Infinity;
    for(const a of choices[0])for(const b of choices[1])for(const c of choices[2])for(const d of choices[3]){
        if(a.k===b.k||a.k===c.k||a.k===d.k||b.k===c.k||b.k===d.k||c.k===d.k)continue;
        const option=[a,b,c,d];
        try{const h0=homography(LAYOUT.markers,option);let error=0;
            for(let i=0;i<4;i++){const v=project(h0,qrModel[i].x,qrModel[i].y);error+=(v.x-detected[i].x)**2+(v.y-detected[i].y)**2;}
            if(error<bestError){bestError=error;found=option;}
        }catch{}
    }
    if(!found)return null;
    const transform=homography(LAYOUT.markers,found),projected=qrModel.map(p=>project(transform,p.x,p.y));
    const qrScale=Math.hypot(projected[1].x-projected[0].x,projected[1].y-projected[0].y),err=Math.max(...projected.map((p,i)=>Math.hypot(p.x-detected[i].x,p.y-detected[i].y)));
    if(err>Math.max(7,qrScale*.08))return null;
    return {found,transform,error:err/Math.max(1,qrScale)};
}
export function alignCard(image, qr) {
    const {width:w,height:h}=image,g=grayscale(image),candidates=referenceCandidates(g,w,h);
    let match=null;
    // Aceita tanto os cartões novos, com QR maior, quanto os já impressos.
    for(const q of QR_LAYOUTS){
        const candidate=locateReferences(candidates,w,h,qr,q);
        if(candidate&&(!match||candidate.error<match.error))match=candidate;
        if(match?.error<.015&&match.found.every(p=>p.fill>.8))break;
    }
    if(!match)throw new ReadError('frame','QR identificado. Enquadre a folha inteira com as quatro marcas visíveis e mantenha o papel plano.');
    const {found,transform}=match;
    if(found.some(p=>p.x<6||p.y<6||p.x>w-6||p.y>h-6))throw new ReadError('frame','Cartão cortado. Deixe uma margem ao redor da folha.');
    const coverage=area(found)/(w*h);
    if(coverage<.12)throw new ReadError('distance','QR identificado. Aproxime a folha inteira para ler as respostas.');
    const normalized = warp(inkChannel(image), w, h, transform);
    let dark = 0,
        light = 0,
        dn = 0,
        ln = 0,
        lap = 0,
        lap2 = 0,
        lapN = 0;
    for (const m of LAYOUT.markers) {
        for (let dy = -16; dy <= 16; dy++)
            for (let dx = -16; dx <= 16; dx++) {
                const x = m.x + dx,
                    y = m.y + dy,
                    v = normalized[y * 800 + x];
                if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
                    dark += v;
                    dn++;
                } else if (Math.abs(dx) > 13 || Math.abs(dy) > 13) {
                    light += v;
                    ln++;
                }
                if (Math.abs(dx) < 13 && Math.abs(dy) < 13) {
                    const l =
                        normalized[y * 800 + x - 1] +
                        normalized[y * 800 + x + 1] +
                        normalized[(y - 1) * 800 + x] +
                        normalized[(y + 1) * 800 + x] -
                        4 * v;
                    lap += l;
                    lap2 += l * l;
                    lapN++;
                }
            }
    }
    const contrast = light / ln - dark / dn,
        sharpness = lap2 / lapN - (lap / lapN) ** 2;
    if (contrast < 90) throw new ReadError('light', 'Contraste insuficiente. Melhore a iluminação e evite reflexos.');
    if (sharpness < 55)
        throw new ReadError('blur', 'Imagem desfocada. Limpe a lente, estabilize a câmera e tente novamente.');
    return { normalized, markers: found, quality: { markerCount: 4, contrast, sharpness, coverage } };
}
const CENTER=[],RING=[],PAPER=[];
for(let dy=-15;dy<=15;dy++)for(let dx=-15;dx<=15;dx++){
    const r=Math.hypot(dx,dy),offset=dy*800+dx;
    if(r<=7)CENTER.push(offset);
    if(r>=8.8&&r<=11.2)RING.push(offset);
    if(r>=13&&r<=15)PAPER.push(offset);
}
export function readBubbles(normalized, count, alternatives) {
    const scores = [],
        answers = [];
    let ambiguous = 0;
    for (let i = 0; i < count; i++) {
        const row = [];
        for (let a = 0; a < alternatives; a++) {
            const p = bubblePosition(i, a);
            const base=p.y*800+p.x;
            let bg=0;for(const offset of PAPER)bg+=normalized[base+offset];
            const paper=bg/PAPER.length,threshold = Math.min(175, paper - 65),weakThreshold=paper-28;
            if (threshold < 65)
                throw new ReadError('shadow', 'Há sombras sobre as respostas. Ilumine a folha por igual.');
            let ringDark=0;for(const offset of RING)if(normalized[base+offset]<threshold)ringDark++;
            if (ringDark / RING.length < 0.14)
                throw new ReadError(
                    'print',
                    'Contorno das bolhas ilegível. Evite reflexos e confira a impressão antes de ler novamente.',
                );
            let filled=0,weakFilled=0;
            for(const offset of CENTER){const value=normalized[base+offset];if(value<threshold)filled++;if(value<weakThreshold)weakFilled++;}
            let score = filled / CENTER.length;
            const weakScore=weakFilled/CENTER.length;
            // Letras cinzas impressas ocupam pouco do centro. Uma tinta cinza
            // clara, preenchida por inteiro, cobre quase toda a área interna.
            if(weakScore>=.68)score=Math.max(score,weakScore);
            else if(weakScore>.40&&score<=.20)score=.30;
            row.push(Number(score.toFixed(4)));
            if (score > 0.2 && score < 0.44) ambiguous++;
        }
        scores.push(row);
        const m = row.flatMap((s, a) => (s >= 0.44 ? [String.fromCharCode(65 + a)] : []));
        answers.push(m);
    }
    if (ambiguous)
        throw new ReadError(
            'ambiguous',
            `${ambiguous} marcação(ões) ambígua(s). Reforce o preenchimento e leia novamente; nada foi salvo.`,
        );
    return {
        scores,
        answers,
        blank: answers.filter((a) => !a.length).length,
        multiple: answers.filter((a) => a.length > 1).length,
    };
}
export function readCard(image, qr, count, alternatives) {
    const aligned = alignCard(image, qr);
    return { ...aligned, ...readBubbles(aligned.normalized, count, alternatives) };
}
