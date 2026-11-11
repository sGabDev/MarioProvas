import fs from 'node:fs';
import {Resvg} from '@resvg/resvg-js';
const svg=fs.readFileSync(new URL('../public/assets/icon.svg',import.meta.url));
for(const width of [192,512])fs.writeFileSync(new URL(`../public/assets/icon-${width}.png`,import.meta.url),new Resvg(svg,{fitTo:{mode:'width',value:width}}).render().asPng());
console.log('Ícones PWA gerados.');
