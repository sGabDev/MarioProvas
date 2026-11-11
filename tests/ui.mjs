import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Resvg } from '@resvg/resvg-js';
import { createRequire } from 'node:module';
import { cardSvg } from '../public/assets/layout.mjs';
const require = createRequire(import.meta.url);
const base = process.env.MARIOPROVAS_TEST_URL;
if (!base) throw Error('Execute por tests/integration.py.');
const dom = new JSDOM(
    '<!doctype html><body><div id="app"></div><div id="toast"></div><dialog id="modal"></dialog></body>',
    { url: base, pretendToBeVisual: true },
);
const nativeFetch = globalThis.fetch;
let cookie = '';
Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    location: dom.window.location,
    FormData: dom.window.FormData,
});
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new dom.window.Event('close'));
};
let captureImage = null,
    cameraCalls = 0,
    trackStopped = false;
dom.window.HTMLCanvasElement.prototype.getContext = function () {
    const element = this,
        surface = createCanvas(element.width, element.height),
        ctx = surface.getContext('2d');
    const sync = () => {
        if (surface.width !== element.width) surface.width = element.width;
        if (surface.height !== element.height) surface.height = element.height;
    };
    return new Proxy(ctx, {
        get(target, key) {
            if (key === 'drawImage')
                return (source, ...args) => {
                    sync();
                    return target.drawImage(
                        source instanceof dom.window.HTMLVideoElement ? captureImage : source,
                        ...args,
                    );
                };
            const member = target[key];
            return typeof member === 'function'
                ? (...args) => {
                      sync();
                      return member.apply(target, args);
                  }
                : member;
        },
    });
};
Object.defineProperty(dom.window, 'isSecureContext', { value: true });
for (const [key, value] of Object.entries({ videoWidth: 1000, videoHeight: 1400, readyState: 4 }))
    Object.defineProperty(dom.window.HTMLVideoElement.prototype, key, { get: () => value });
dom.window.HTMLVideoElement.prototype.play = async function () {};
Object.defineProperty(navigator, 'mediaDevices', {
    value: {
        getUserMedia: async () => {
            cameraCalls++;
            return {
                getTracks: () => [{ stop: () => (trackStopped = true) }],
                getVideoTracks: () => [{ getSettings: () => ({ deviceId: 'test-image' }) }],
            };
        },
        enumerateDevices: async () => [{ kind: 'videoinput', deviceId: 'test-image', label: 'Imagem óptica de teste' }],
    },
});
window.jsQR = require('../public/assets/vendor/jsQR.js');
globalThis.fetch = async (url, opts = {}) => {
    const headers = new Headers(opts.headers);
    if (cookie) headers.set('Cookie', cookie);
    const r = await nativeFetch(new URL(url, base), { ...opts, headers });
    for (const sc of r.headers.getSetCookie()) cookie = sc.split(';')[0];
    return r;
};
const wait = async (predicate) => {
    for (let i = 0; i < 150; i++) {
        if (predicate()) return;
        await new Promise((r) => setTimeout(r, 30));
    }
    throw Error('Transição da interface não concluída.');
};
const $ = (s) => document.querySelector(s);
const go = async (hash, selector) => {
    location.hash = hash;
    await wait(() => $(selector));
};
await import('../public/assets/app.mjs');
await wait(() => $('#auth'));
$('#email').value = process.env.MARIOPROVAS_TEST_EMAIL;
$('#password').value = process.env.MARIOPROVAS_TEST_PASSWORD;
$('#auth').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(() => $('.sidebar') && $('#main h1')?.textContent.startsWith('Olá'));
assert.ok(document.querySelectorAll('.stat').length === 4);
await go('classes', '.class-grid');
assert.ok(document.querySelectorAll('.class-grid .card').length === 27);
const firstClassLink = $('.class-grid a');
firstClassLink.click();
await wait(() => $('#student-table tbody tr'));
assert.ok($('#main h1').textContent.length > 0);
await go('new', '#new-exam');
$('#exam-name').value = 'VERIFICAÇÃO DA INTERFACE (base isolada)';
$('#area-0').value = 'Disciplina de verificação';
$('#area-0').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
$('#count-0').value = 2;
$('#count-0').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
$('#add-area').click();
$('#area-1').value = 'Segunda área de verificação';
$('#area-1').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
$('#count-1').value = 1;
$('#count-1').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
$('#prepare-key').click();
assert.equal(document.querySelectorAll('[data-answer-area]').length, 3);
document.querySelectorAll('[data-answer-area]').forEach((s) => (s.value = 'A'));
$('#new-exam').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(() => $('#scan') && location.hash.startsWith('#exam/'));
const eid = Number(location.hash.split('/')[1]);
assert.ok(eid > 0);
$('#card-count').value = 1;
$('#generate').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(() => [...document.querySelectorAll('a')].some((a) => a.textContent === 'Abrir impressão do lote gerado'));
assert.ok(document.querySelector('a[href*="print.html"]'));
$('#scan').click();
await wait(() => $('#start-camera'));
assert.ok($('#camera-status').textContent.includes('Aguardando'));
assert.equal($('#camera').srcObject ?? null, null);
assert.equal(cameraCalls, 0, 'abrir leitor não solicita câmera');
const cardData = (await (await fetch(`api.php?action=cards&exam_id=${eid}`)).json()).data;
const qrFactory = require('../public/assets/vendor/qrcode.js');
const card = cardData.cards[0];
let optical = cardSvg(
    card,
    { ...cardData.exam, name: 'VALIDAÇÃO ÓPTICA DA INTERFACE', class_name: '', date: '' },
    cardData.questions,
    qrFactory,
);
optical = optical.replace(
    '</svg>',
    '<circle cx="116" cy="328" r="8.8" fill="black"/><circle cx="116" cy="396" r="8.8" fill="black"/><circle cx="180" cy="396" r="8.8" fill="black"/></svg>',
);
captureImage = await loadImage(new Resvg(optical, { fitTo: { mode: 'width', value: 1000 } }).render().asPng());
$('#start-camera').click();
await wait(() => $('#save-scan'));
assert.equal(cameraCalls, 1);
assert.ok($('#review').textContent.includes('1 válidas'));
assert.ok($('#review').textContent.includes('1 em branco'));
assert.ok($('#review').textContent.includes('1 múltiplas'));
$('#scan-student').value = $('#scan-student option[value]:not([value=""])').value;
$('#assign').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await wait(() => $('#next-card'));
assert.ok($('#review').textContent.includes('1 acertos em 1 questões válidas; 2 anuladas.'));
$('#next-card').click();
assert.equal(cameraCalls, 1, 'continua sem reiniciar getUserMedia');
$('#close-scan').click();
assert.equal($('#modal').open, false);
assert.ok(trackStopped, 'fechar leitor encerra a câmera');
await go(`reports/${eid}`, '#question-table');
assert.ok($('#main').textContent.includes('1 resultados completos'));
document.querySelector('[data-result]').click();
await wait(() => $('#modal').open);
assert.ok($('#modal').textContent.includes('2'));
$('#modal [data-close]').click();
await go('import', '#upload');
assert.ok($('#csv').accept.includes('.csv'));
await go('team', '#team-form');
assert.ok(document.querySelector('#team-form input[type=password]'));
await go('help', '.steps');
assert.ok($('#main').textContent.includes('Ativar câmera'));
$('#logout').click();
await wait(() => $('#auth'));
assert.equal(document.querySelector('.sidebar'), null);
console.log(
    'OK: interface DOM com servidor real — login, turmas, criação de prova, gabarito, geração, leitor óptico em duas capturas de imagem de teste, associação, gravação, próximo cartão sem reiniciar câmera, resultado individual, relatórios, importação, equipe, ajuda e logout. getUserMedia substituído somente neste teste; câmera física não homologada.',
);
window.close();
process.exit(0);
