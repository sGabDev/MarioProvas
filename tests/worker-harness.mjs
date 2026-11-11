import {parentPort} from 'node:worker_threads';
import {createRequire} from 'node:module';
globalThis.self=globalThis;
// No navegador o UMD usa self; em Node o mesmo arquivo é CommonJS.
self.jsQR=createRequire(import.meta.url)('../public/assets/vendor/jsQR.js');
self.postMessage=(message,transfer=[])=>parentPort.postMessage(message,transfer);
await import('../public/assets/scan-worker.mjs');
parentPort.on('message',data=>self.onmessage?.({data}));
