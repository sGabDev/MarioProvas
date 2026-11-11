import { LAYOUT, bubblePosition } from './layout.mjs';
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
function sample(g, w, h, x, y) {
    if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
    const ix = Math.floor(x),
        iy = Math.floor(y),
        dx = x - ix,
        dy = y - iy;
    return (
        g[iy * w + ix] * (1 - dx) * (1 - dy) +
        g[iy * w + ix + 1] * dx * (1 - dy) +
        g[(iy + 1) * w + ix] * (1 - dx) * dy +
        g[(iy + 1) * w + ix + 1] * dx * dy
    );
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
                const ns = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
                for (const k of ns)
                    if (k >= 0 && !seen[k] && g[k] < 100) {
                        seen[k] = 1;
                        stack[tail++] = k;
                    }
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
                count / (bw * bh) > 0.67
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
export function alignCard(image, qr) {
    const { width: w, height: h } = image,
        g = grayscale(image),
        q = LAYOUT.qr;
    const estimate = homography(
        [
            { x: q.x, y: q.y },
            { x: q.x + q.size, y: q.y },
            { x: q.x + q.size, y: q.y + q.size },
            { x: q.x, y: q.y + q.size },
        ],
        qrPoints(qr.location),
    );
    const predicted = LAYOUT.markers.map((p) => project(estimate, p.x, p.y));
    const cand = components(g, w, h),
        choices = [];
    for (let i = 0; i < 4; i++) {
        const p = predicted[i];
        const origin = LAYOUT.markers[i];
        const edge = project(estimate, origin.x + 20, origin.y);
        const expectedSize = Math.hypot(edge.x - p.x, edge.y - p.y);
        const tolerance = Math.max(28, Math.hypot(w, h) * 0.13);
        const options = [];
        cand.forEach((c, k) => {
            const distance = Math.hypot(c.x - p.x, c.y - p.y);
            const size = Math.sqrt(c.width * c.height);
            const ratio = size / expectedSize;
            if (distance > tolerance || ratio < 0.4 || ratio > 2.2) return;
            options.push({ ...c, k, cost: distance + Math.abs(Math.log(ratio)) * 35 });
        });
        options.sort((a, b) => a.cost - b.cost);
        if (!options.length)
            throw new ReadError(
                'frame',
                'As quatro marcas não estão visíveis. Enquadre a folha inteira, aproxime e evite sombras.',
            );
        choices.push(options.slice(0, 12));
    }
    const qrModel = [
        { x: q.x, y: q.y },
        { x: q.x + q.size, y: q.y },
        { x: q.x + q.size, y: q.y + q.size },
        { x: q.x, y: q.y + q.size },
    ];
    const detectedQR = qrPoints(qr.location);
    let found = null,
        bestError = Infinity;
    for (const a of choices[0])
        for (const b of choices[1])
            for (const c of choices[2])
                for (const d of choices[3]) {
                    const option = [a, b, c, d];
                    if (new Set(option.map((p) => p.k)).size !== 4) continue;
                    try {
                        const h0 = homography(LAYOUT.markers, option);
                        const error = qrModel.reduce((sum, p, i) => {
                            const v = project(h0, p.x, p.y);
                            return sum + Math.hypot(v.x - detectedQR[i].x, v.y - detectedQR[i].y) ** 2;
                        }, 0);
                        if (error < bestError) {
                            bestError = error;
                            found = option;
                        }
                    } catch {}
                }
    if (!found) throw new ReadError('alignment', 'Não foi possível alinhar as quatro marcas.');
    if (found.some((p) => p.x < 8 || p.y < 8 || p.x > w - 8 || p.y > h - 8))
        throw new ReadError('frame', 'Cartão cortado. Deixe uma margem ao redor da folha.');
    const coverage = area(found) / (w * h);
    if (coverage < 0.12) throw new ReadError('distance', 'Cartão muito distante. Aproxime a câmera.');
    const transform = homography(LAYOUT.markers, found);
    const err = Math.max(
        ...qrModel.map((p, i) => {
            const v = project(transform, p.x, p.y);
            return Math.hypot(v.x - detectedQR[i].x, v.y - detectedQR[i].y);
        }),
    );
    const projectedQR = qrModel.map((p) => project(transform, p.x, p.y));
    const qrScale = Math.hypot(projectedQR[1].x - projectedQR[0].x, projectedQR[1].y - projectedQR[0].y);
    if (err > Math.max(7, qrScale * 0.08)) {
        const error = new ReadError(
            'alignment',
            'Marcas inconsistentes. Use uma única folha plana e enquadre novamente.',
        );
        error.details = { predicted, found, err, qrScale };
        throw error;
    }
    const normalized = new Uint8Array(LAYOUT.width * LAYOUT.height);
    for (let y = 0; y < LAYOUT.height; y++)
        for (let x = 0; x < LAYOUT.width; x++) {
            const p = project(transform, x, y);
            normalized[y * LAYOUT.width + x] = sample(g, w, h, p.x, p.y);
        }
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
export function readBubbles(normalized, count, alternatives) {
    const scores = [],
        answers = [];
    let ambiguous = 0;
    for (let i = 0; i < count; i++) {
        const row = [];
        for (let a = 0; a < alternatives; a++) {
            const p = bubblePosition(i, a);
            let bg = 0,
                bn = 0;
            for (let dy = -15; dy <= 15; dy++)
                for (let dx = -15; dx <= 15; dx++) {
                    const r = Math.hypot(dx, dy);
                    if (r >= 13 && r <= 15) {
                        bg += normalized[(p.y + dy) * 800 + p.x + dx];
                        bn++;
                    }
                }
            const threshold = Math.min(175, bg / bn - 65);
            if (threshold < 65)
                throw new ReadError('shadow', 'Há sombras sobre as respostas. Ilumine a folha por igual.');
            let ringDark = 0,
                ringTotal = 0;
            for (let dy = -12; dy <= 12; dy++)
                for (let dx = -12; dx <= 12; dx++) {
                    const r = Math.hypot(dx, dy);
                    if (r >= 8.8 && r <= 11.2) {
                        ringTotal++;
                        if (normalized[(p.y + dy) * 800 + p.x + dx] < threshold) ringDark++;
                    }
                }
            if (ringDark / ringTotal < 0.14)
                throw new ReadError(
                    'print',
                    'Contorno das bolhas ilegível. Evite reflexos e confira a impressão antes de ler novamente.',
                );
            let filled = 0,
                total = 0;
            for (let dy = -7; dy <= 7; dy++)
                for (let dx = -7; dx <= 7; dx++)
                    if (dx * dx + dy * dy <= 49) {
                        total++;
                        if (normalized[(p.y + dy) * 800 + p.x + dx] < threshold) filled++;
                    }
            const score = filled / total;
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
