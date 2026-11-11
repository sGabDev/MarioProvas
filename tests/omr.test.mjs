import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { cardSvg } from '../public/assets/layout.mjs';
import { readCard, homography, project } from '../public/assets/omr.mjs';
import {decodeQr} from '../public/assets/qr.mjs';
const require = createRequire(import.meta.url),
    jsQR = require('../public/assets/vendor/jsQR.js'),
    qrcode = require('../public/assets/vendor/qrcode.js');
const card = { token: 'a102c304e506a708b901c203d405e607', page: 1, start_number: 1, question_count: 60, booklet_id: 1 };
const exam = { name: 'VERIFICAÇÃO ÓPTICA AUTOMATIZADA', class_name: '', date: '', alternatives: 5 };
const qs = Array.from({ length: 60 }, (_, i) => ({ number: i + 1 }));
const expected = Array.from({ length: 60 }, (_, i) =>
    i === 5 ? [] : i === 7 ? ['A', 'D'] : [String.fromCharCode(65 + (i % 5))],
);
let svg = cardSvg(card, exam, qs, qrcode);
let fill = '';
expected.forEach((marks, i) =>
    marks.forEach((m) => {
        const col = Math.floor(i / 20),
            row = i % 20;
        fill += `<circle cx="${116 + col * 236 + (m.charCodeAt(0) - 65) * 32}" cy="${328 + row * 34}" r="8.8" fill="black"/>`;
    }),
);
svg = svg.replace('</svg>', fill + '</svg>');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1000 } }).render().asPng();
fs.mkdirSync('tests/artifacts', { recursive: true });
fs.writeFileSync('tests/artifacts/cartao-optico.png', png);
const original = await loadImage(png);
const canvas = createCanvas(1000, 1400),
    context = canvas.getContext('2d');
context.drawImage(original, 0, 0);
const straight = context.getImageData(0, 0, 1000, 1400);
function recognize(image) {
    const qr = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
    assert.ok(qr, 'QR real deve ser decodificado');
    assert.equal(qr.data, card.token);
    return readCard(image, qr, 60, 5);
}
test('QR rasterizado, 60 questões, branco e múltiplas reais no bitmap', () => {
    const r = recognize(straight);
    assert.deepEqual(r.answers, expected);
    assert.equal(r.blank, 1);
    assert.equal(r.multiple, 1);
    assert.ok(r.quality.sharpness >= 55);
    fs.writeFileSync('tests/artifacts/evidence.json', JSON.stringify({ scores: r.scores, quality: r.quality }));
});
test('homografia reconhece perspectiva, iluminação e enquadramento deslocado', () => {
    const w = 1250,
        h = 1550,
        c = createCanvas(w, h),
        ctx = c.getContext('2d'),
        out = ctx.createImageData(w, h);
    out.data.fill(215);
    for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
    const inverse = homography(
        [
            { x: 120, y: 70 },
            { x: 1150, y: 170 },
            { x: 1050, y: 1480 },
            { x: 70, y: 1370 },
        ],
        [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1400 },
            { x: 0, y: 1400 },
        ],
    );
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const p = project(inverse, x, y);
            if (p.x < 0 || p.y < 0 || p.x >= 999 || p.y >= 1399) continue;
            const sx = Math.floor(p.x),
                sy = Math.floor(p.y);
            const a = (sy * 1000 + sx) * 4,
                b = (y * w + x) * 4;
            for (let k = 0; k < 3; k++) out.data[b + k] = Math.min(255, straight.data[a + k] * 0.88 + 12);
        }
    ctx.putImageData(out, 0, 0);
    fs.writeFileSync('tests/artifacts/perspectiva.png', c.toBuffer('image/png'));
    const r = recognize(out);
    assert.deepEqual(r.answers, expected);
});
test('rotação de 90 graus é orientada pelo QR', () => {
    const c = createCanvas(1400, 1000),
        ctx = c.getContext('2d');
    ctx.translate(1400, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(original, 0, 0);
    const r = recognize(ctx.getImageData(0, 0, 1400, 1000));
    assert.deepEqual(r.answers, expected);
});
test('marca de referência ausente impede leitura', () => {
    const c = createCanvas(1000, 1400),
        ctx = c.getContext('2d');
    ctx.drawImage(original, 0, 0);
    ctx.fillStyle = 'white';
    ctx.fillRect(20, 1310, 70, 80);
    const image = ctx.getImageData(0, 0, 1000, 1400),
        qr = jsQR(image.data, 1000, 1400);
    assert.ok(qr);
    assert.throws(() => readCard(image, qr, 60, 5), /marcas|alinhar|inconsistentes/);
});
test('desfoque forte não produz respostas', () => {
    const c = createCanvas(1000, 1400),
        ctx = c.getContext('2d');
    ctx.filter = 'blur(4px)';
    ctx.drawImage(original, 0, 0);
    const image = ctx.getImageData(0, 0, 1000, 1400),
        qr = jsQR(image.data, 1000, 1400);
    if (qr) assert.throws(() => readCard(image, qr, 60, 5), /desfocada|marcas|inconsistentes|alinhar/);
    else assert.equal(qr, null);
});
test('marcação intermediária é rejeitada como ambígua', () => {
    const c = createCanvas(1000, 1400),
        ctx = c.getContext('2d');
    ctx.drawImage(original, 0, 0);
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(116 * 1.25, 328 * 1.25, 8 * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(116 * 1.25, 328 * 1.25, 4 * 1.25, 0, Math.PI * 2);
    ctx.fill();
    const image = ctx.getImageData(0, 0, 1000, 1400),
        qr = jsQR(image.data, 1000, 1400);
    assert.ok(qr);
    assert.throws(() => readCard(image, qr, 60, 5), /ambígua/);
});
test('QR contém somente token aleatório, sem nome ou respostas', () => {
    const qr = jsQR(straight.data, 1000, 1400);
    assert.match(qr.data, /^[a-f0-9]{32}$/);
    assert.equal(qr.data, card.token);
});

const inks=[['preta','#171717'],['azul','#164cd4'],['vermelha','#e22936'],['verde','#259b54'],['roxa','#9143b4'],['rosa','#ed68b7'],['laranja','#f39432'],['amarela','#f8e53a'],['ciano','#24d5e6'],['marrom','#966441'],['cinza','#b9b9b9'],['rosa clara','#f9cfdf'],['amarelo claro','#fff5ce'],['cinza clara','#d0d0d0']];
for(const [name,color] of inks)test(`preenchimento em caneta ${name} preserva válidas, branco e múltiplas`,async()=>{
    const colored=svg.replace(/fill="black"\/>/g,`fill="${color}"/>`);
    const im=await loadImage(new Resvg(colored,{fitTo:{mode:'width',value:1000}}).render().asPng());
    const c=createCanvas(1000,1400),cx=c.getContext('2d');cx.drawImage(im,0,0);const image=cx.getImageData(0,0,1000,1400);
    const qr=decodeQr(image,jsQR);assert.ok(qr,'QR precisa ser identificado');const r=readCard(image,qr,60,5);assert.deepEqual(r.answers,expected);assert.equal(r.blank,1);assert.equal(r.multiple,1);
});
test('cartões antigos com QR menor continuam reconhecidos',async()=>{
    const legacy=cardSvg({...card,layoutVersion:1},exam,qs,qrcode).replace('</svg>',fill+'</svg>');
    const im=await loadImage(new Resvg(legacy,{fitTo:{mode:'width',value:1000}}).render().asPng());const c=createCanvas(1000,1400),cx=c.getContext('2d');cx.drawImage(im,0,0);const image=cx.getImageData(0,0,1000,1400),qr=decodeQr(image,jsQR);
    assert.ok(qr);assert.deepEqual(readCard(image,qr,60,5).answers,expected);
});
test('QR é reconhecido com resolução menor, papel deslocado e busca pelo último recorte',async()=>{
    const c=createCanvas(1024,768),cx=c.getContext('2d');cx.fillStyle='#d6d9d0';cx.fillRect(0,0,1024,768);cx.drawImage(original,290,18,510,714);
    const image=cx.getImageData(0,0,1024,768),qr=decodeQr(image,jsQR);assert.ok(qr);assert.equal(qr.data,card.token);
    const next=decodeQr(image,jsQR,{previous:qr,thorough:false});assert.ok(next);assert.deepEqual(readCard(image,next,60,5).answers,expected);
});
test('busca de QR tolera baixo contraste sem aceitar um código desconhecido',()=>{
    const image={width:straight.width,height:straight.height,data:new Uint8ClampedArray(straight.data)};
    for(let i=0;i<image.data.length;i+=4)for(let k=0;k<3;k++)image.data[i+k]=155+Math.round(image.data[i+k]*.30);
    const qr=decodeQr(image,jsQR);assert.ok(qr);assert.equal(qr.data,card.token);
});

for(const [label,black,gain,gradient] of [['ambiente escuro',12,.23,0],['baixo contraste',105,.22,0],['sombra gradual',15,.30,.20]])test(`sem lanterna: ${label}, QR e respostas em pixels com ruído`,()=>{
    const image={width:straight.width,height:straight.height,data:new Uint8ClampedArray(straight.data)};
    let seed=12345;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=((seed>>>24)/255-.5)*4,i=(y*image.width+x)*4;
        for(let c=0;c<3;c++)image.data[i+c]=black+straight.data[i+c]*(gain+gradient*x/image.width)+noise;
    }
    const qr=decodeQr(image,jsQR);assert.ok(qr,'QR com realce de contraste');
    const r=readCard(image,qr,60,5);assert.deepEqual(r.answers,expected);assert.ok(r.quality.rawContrast>=30);
    if(label==='ambiente escuro'){
        const pixels=context.createImageData(image.width,image.height);pixels.data.set(image.data);context.putImageData(pixels,0,0);fs.writeFileSync('tests/artifacts/pouca-luz.png',canvas.toBuffer('image/png'));
    }
});

test('escuridão sem informação suficiente é rejeitada em vez de inventar marcações',()=>{
    const image={width:straight.width,height:straight.height,data:new Uint8ClampedArray(straight.data)};
    for(let i=0;i<image.data.length;i+=4)for(let c=0;c<3;c++)image.data[i+c]=10+straight.data[i+c]*.08;
    const qr=decodeQr(image,jsQR);
    if(qr)assert.throws(()=>readCard(image,qr,60,5));
    else assert.equal(qr,null);
});
