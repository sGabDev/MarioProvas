import { escapeHtml as esc } from './layout.mjs';
import { readCard } from './omr.mjs';
let active = null;
export function stopScanner() {
    if (active) {
        active.stopped = true;
        clearTimeout(active.timer);
        active.stream?.getTracks().forEach((t) => t.stop());
        if (active.video) active.video.srcObject = null;
        const status = document.querySelector('#camera-status');
        if (status) status.textContent = 'Câmera desligada. Toque em Ativar / Reiniciar câmera para retomar.';
        active = null;
    }
}
export function openScanner(exam, ui) {
    stopScanner();
    const { api, toast, openModal, icon } = ui;
    const modal = openModal(
        `<div class="dialog-head"><div><div class="eyebrow">Correção pela câmera</div><h2>${esc(exam.name)}</h2></div><button class="quiet" id="close-scan" aria-label="Fechar leitura">${icon('close')}</button></div><div id="scanner-content"><p class="small muted">Enquadre uma única folha inteira. Mantenha o QR e as quatro marcas visíveis. A câmera será ativada somente ao tocar no botão abaixo.</p><div class="note">Depois de reconhecer as marcações, escolha o estudante. Respostas não são digitadas. Nenhum resultado é salvo enquanto a leitura estiver pendente.</div><div class="toolbar"><button id="start-camera">${icon('scan')}Ativar câmera</button><select id="camera-select" aria-label="Escolher câmera" hidden></select></div><div class="camera-box"><video id="camera" playsinline muted></video><div class="frame"></div></div><div class="camera-status" id="camera-status" role="status">Aguardando ativação da câmera.</div><div id="review"></div></div>`,
    );
    const s = {
        video: modal.querySelector('#camera'),
        stream: null,
        stopped: false,
        paused: true,
        timer: null,
        identity: new Map(),
        stable: null,
        processing: false,
    };
    active = s;
    const status = (t) => {
        if (modal.querySelector('#camera-status')) modal.querySelector('#camera-status').textContent = t;
    };
    const close = () => {
        stopScanner();
        modal.close();
    };
    modal.querySelector('#close-scan').onclick = close;
    modal.addEventListener(
        'close',
        () => {
            if (active === s) stopScanner();
        },
        { once: true },
    );
    modal.addEventListener(
        'cancel',
        () => {
            if (active === s) stopScanner();
        },
        { once: true },
    );
    const frame = document.createElement('canvas'),
        ctx = frame.getContext('2d', { willReadFrequently: true });
    async function start(deviceId) {
        if (!modal.open) return;
        active = s;
        s.stream?.getTracks().forEach((t) => t.stop());
        s.stopped = false;
        s.paused = true;
        s.stable = null;
        status('Solicitando acesso à câmera…');
        if (!window.isSecureContext) {
            status('A câmera exige HTTPS. Em testes locais, abra pelo endereço localhost no próprio computador.');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            status('Este navegador não oferece acesso à câmera. Abra em um navegador compatível.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
                    width: { ideal: 1920 },
                    height: { ideal: 1440 },
                },
                audio: false,
            });
            if (active !== s || s.stopped) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            s.stream = stream;
            s.video.srcObject = stream;
            await s.video.play();
            s.paused = false;
            const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
            const select = modal.querySelector('#camera-select');
            select.hidden = devices.length < 2;
            select.innerHTML = devices
                .map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || `Câmera ${i + 1}`)}</option>`)
                .join('');
            select.value = stream.getVideoTracks()[0].getSettings().deviceId || devices[0]?.deviceId;
            modal.querySelector('#start-camera').textContent = 'Reiniciar câmera';
            status('Câmera ativa. Enquadre a folha inteira e mantenha-a firme.');
            clearTimeout(s.timer);
            loop();
        } catch (e) {
            const msg =
                e.name === 'NotAllowedError'
                    ? 'Acesso à câmera não autorizado. Libere a câmera nas permissões do navegador e tente novamente.'
                    : e.name === 'NotFoundError'
                      ? 'Nenhuma câmera encontrada. Conecte uma câmera e tente novamente.'
                      : e.name === 'NotReadableError'
                        ? 'A câmera está ocupada por outro aplicativo. Feche-o e tente novamente.'
                        : 'Não foi possível ativar esta câmera. Tente outra câmera ou reinicie o navegador.';
            status(msg);
        }
    }
    modal.querySelector('#start-camera').onclick = () => start();
    modal.querySelector('#camera-select').onchange = (e) => start(e.target.value);
    function schedule() {
        if (active === s && !s.stopped) s.timer = setTimeout(loop, 550);
    }
    async function loop() {
        if (active !== s || s.stopped) return;
        if (s.paused || s.processing || s.video.readyState < 2) {
            schedule();
            return;
        }
        s.processing = true;
        try {
            const maxSide = 1600,
                scale = Math.min(1, maxSide / Math.max(s.video.videoWidth, s.video.videoHeight));
            frame.width = Math.round(s.video.videoWidth * scale);
            frame.height = Math.round(s.video.videoHeight * scale);
            ctx.drawImage(s.video, 0, 0, frame.width, frame.height);
            const image = ctx.getImageData(0, 0, frame.width, frame.height);
            const qr = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
            if (!qr) {
                s.stable = null;
                status('QR não identificado. Enquadre a folha inteira, aproxime e melhore a luz. Nada foi salvo.');
                return;
            }
            if (!/^[a-f0-9]{32}$/.test(qr.data)) {
                s.stable = null;
                status('QR ilegível ou desconhecido. Use um cartão gerado pelo MarioProvas.');
                return;
            }
            let card = s.identity.get(qr.data);
            if (!card) {
                card = await api('identify', undefined, { token: qr.data, exam_id: exam.id });
                if (active !== s || s.stopped) return;
                s.identity.set(qr.data, card);
            }
            if (card.processed) {
                status('Cartão já processado. Retire esta folha e apresente a próxima.');
                return;
            }
            const reading = readCard(image, qr, card.question_count, exam.alternatives);
            const signature = JSON.stringify(reading.answers),
                stable = s.stable;
            if (!stable || stable.token !== qr.data || stable.signature !== signature) {
                s.stable = { token: qr.data, signature };
                status('Cartão alinhado. Mantenha a câmera firme para confirmar as marcações…');
                return;
            }
            s.paused = true;
            s.stable = null;
            status('Leitura reconhecida. Confira a folha e escolha o estudante.');
            renderReview(card, qr.data, reading);
        } catch (e) {
            s.stable = null;
            status(`${e.message} Nada foi salvo nesta tentativa.`);
        } finally {
            s.processing = false;
            schedule();
        }
    }
    function resume() {
        modal.querySelector('#review').innerHTML = '';
        s.paused = false;
        s.stable = null;
        status('Pronto para o próximo cartão. Retire a folha anterior.');
    }
    function renderReview(card, token, reading) {
        const available = exam.students.filter(
            (student) =>
                !student.result_id &&
                (!student.booklet_id || student.booklet_id === card.booklet) &&
                (!card.student_id || student.id === card.student_id),
        );
        const review = modal.querySelector('#review');
        review.innerHTML = `<section class="card" style="margin-top:12px"><div class="scan-review"><div><canvas id="aligned" width="800" height="1120" aria-label="Imagem do cartão alinhado"></canvas></div><div><h3>Conjunto #${card.booklet} · folha ${card.page}</h3><p class="small muted">Questões ${card.start_number}–${card.start_number + card.question_count - 1}. A imagem ao lado foi capturada da câmera.</p><div class="scan-counts"><span><strong>${reading.answers.filter((a) => a.length === 1).length}</strong> válidas</span><span><strong>${reading.blank}</strong> em branco</span><span><strong>${reading.multiple}</strong> múltiplas</span></div><p class="small muted">Branco e múltiplas serão anuladas. Não contam como erros.</p><form id="assign"><div class="field"><label for="scan-student">De qual estudante é este cartão?</label><select id="scan-student" required><option value="">Selecione pelo nome / identificador</option>${available.map((student) => `<option value="${student.id}" ${card.student_id === student.id ? 'selected' : ''}>${esc(student.social_name || student.name)} · ${esc(student.external_id)}</option>`).join('')}</select></div>${card.student_id ? '<p class="small muted">Este conjunto já foi vinculado na leitura de outra folha. A associação será mantida.</p>' : ''}<div class="actions"><button type="submit" id="save-scan" ${available.length ? '' : 'disabled'}>Salvar para este estudante</button><button class="secondary" type="button" id="retry-scan">Refazer leitura</button></div><div id="save-error" role="alert"></div></form></div></div><details style="margin-top:18px"><summary class="small link">Ver marcações reconhecidas</summary><div class="report-questions" style="margin-top:15px">${reading.answers.map((a, i) => `<div class="question-chip ${a.length === 1 ? '' : 'blank'}"><strong>Q${card.start_number + i}</strong>${a.length === 1 ? a[0] : a.length ? 'Anulada: ' + a.join(', ') : 'Anulada: branco'}</div>`).join('')}</div></details></section>`;
        const canvas = review.querySelector('#aligned'),
            cx = canvas.getContext('2d'),
            image = cx.createImageData(800, 1120);
        for (let i = 0; i < reading.normalized.length; i++) {
            image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = reading.normalized[i];
            image.data[i * 4 + 3] = 255;
        }
        cx.putImageData(image, 0, 0);
        review.querySelector('#retry-scan').onclick = resume;
        review.querySelector('#assign').onsubmit = async (ev) => {
            ev.preventDefault();
            const button = review.querySelector('#save-scan');
            if (button.disabled) return;
            button.disabled = true;
            try {
                const studentId = Number(review.querySelector('#scan-student').value);
                const out = await api('scan', {
                    exam_id: exam.id,
                    token,
                    student_id: studentId,
                    scores: reading.scores,
                    quality: reading.quality,
                });
                if (active !== s || s.stopped) return;
                card.processed = true;
                const student = exam.students.find((x) => x.id === studentId);
                student.booklet_id = card.booklet;
                if (out.complete) student.result_id = out.result_id;
                for (const known of s.identity.values())
                    if (known.booklet === card.booklet) known.student_id = studentId;
                toast(out.message);
                ui.onSaved?.();
                status(out.message);
                review.innerHTML = `<section class="card"><h3>${out.complete ? 'Resultado salvo' : 'Página salva · conjunto pendente'}</h3><p class="small">${esc(student.social_name || student.name)} · ${out.complete ? `${out.correct} acertos em ${out.valid} questões válidas; ${out.annulled} anuladas. ${out.percentage === null ? 'Percentual não calculável.' : out.percentage + '% de acertos.'}` : esc(out.message)}</p><button id="next-card">${icon('scan')}Próximo cartão</button></section>`;
                review.querySelector('#next-card').onclick = resume;
            } catch (e) {
                if (review.querySelector('#save-error'))
                    review.querySelector('#save-error').innerHTML = `<div class="error">${esc(e.message)}</div>`;
                button.disabled = false;
            }
        };
        review.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}
