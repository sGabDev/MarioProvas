import { escapeHtml as esc } from './layout.mjs';
import { openScanner, stopScanner } from './scanner.mjs';
const $ = (s, root = document) => root.querySelector(s),
    $$ = (s, root = document) => [...root.querySelectorAll(s)];
let state = {},
    dash = null,
    studentsCache = [],
    routeVersion = 0,
    installPrompt = null;
const paths = {
    home: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
    exam: 'M8 3h8v3H8z M6 4H4v17h16V4h-2 M8 11h8 M8 16h5',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    chart: 'M4 3v17h17 M8 15v-4 M13 15V7 M18 15V5',
    scan: 'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M7 12h10 M12 7v10',
    plus: 'M12 5v14 M5 12h14',
    upload: 'M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5',
    arrow: 'M5 12h14 M14 7l5 5-5 5',
    logout: 'M9 5H4v14h5 M9 12h12 M16 7l5 5-5 5',
    print: 'M6 9V3h12v6 M6 18H3V9h18v9h-3 M6 14h12v7H6z',
    close: 'M6 6l12 12 M18 6L6 18',
    check: 'M5 12l4 4L19 6',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    file: 'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h5',
    book: 'M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3z M21 4h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5z',
    shield: 'M12 2l8 3v7c0 5-8 10-8 10S4 17 4 12V5z M8 11l3 3 5-5',
};
export const icon = (name) =>
    `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
export function toast(message) {
    $('#toast').textContent = message;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($('#toast').textContent = ''), 6000);
}
export async function api(action, data, params = {}) {
    const url = new URL('api.php', location.href);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const opts = { credentials: 'same-origin', cache: 'no-store' };
    if (data !== undefined) {
        opts.method = 'POST';
        opts.headers = { 'X-CSRF-Token': state.csrf };
        if (data instanceof FormData) opts.body = data;
        else {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(data);
        }
    }
    let response;
    try {
        response = await fetch(url, opts);
    } catch {
        throw Error('Sem conexão com o servidor. Nada foi confirmado como salvo. Tente novamente.');
    }
    const j = await response.json();
    if (!j.ok) {
        if (response.status === 401 && action !== 'login') {
            state.user = null;
            renderAuth();
        }
        throw Error(j.error || 'Não foi possível concluir.');
    }
    if (j.data?.csrf) state.csrf = j.data.csrf;
    return j.data;
}
const pct = (n) =>
    n === null || n === undefined ? '—' : `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const decimal = (n) =>
    n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const displayName = (s) => s.social_name || s.name;
const dateFmt = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d);
const empty = (title, text, ico = 'file') =>
    `<div class="empty">${icon(ico)}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
const stat = (label, value, detail, ico) =>
    `<div class="stat"><div class="stat-top">${label}<span class="stat-icon">${icon(ico)}</span></div><strong>${value}</strong><small>${detail}</small></div>`;
const head = (tag, title, desc, actions = '') =>
    `<div class="eyebrow">${tag}</div><div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="actions">${actions}</div></div>`;
const field = (id, label, type = 'text', extra = '') =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" ${extra}></div>`;
function errorAt(form, message) {
    let el = $('.error', form);
    if (!el) {
        el = document.createElement('div');
        el.className = 'error';
        el.setAttribute('role', 'alert');
        form.prepend(el);
    }
    el.textContent = message;
}
async function busy(button, fn) {
    if (button.disabled) return;
    button.disabled = true;
    try {
        await fn();
    } catch (e) {
        toast(e.message);
    } finally {
        button.disabled = false;
    }
}
export function openModal(html) {
    const m = $('#modal');
    m.innerHTML = html;
    $$('[data-close]', m).forEach((b) => (b.onclick = () => m.close()));
    if (!m.open) m.showModal();
    return m;
}
function shell(active) {
    $('#app').innerHTML =
        `<div class="shell"><aside class="sidebar"><a class="brand" href="#home"><img src="assets/icon.svg" alt="">MarioProvas</a><div class="nav-label">Espaço do professor</div><nav aria-label="Principal">${[
            ['home', 'Visão geral', 'home'],
            ['exams', 'Simulados', 'exam'],
            ['classes', 'Turmas e estudantes', 'users'],
            ['reports', 'Relatórios', 'chart'],
        ]
            .map(([r, l, i]) => `<a class="nav-item ${active === r ? 'active' : ''}" href="#${r}">${icon(i)}${l}</a>`)
            .join(
                '',
            )}<div class="nav-label">Organização</div><a class="nav-item ${active === 'import' ? 'active' : ''}" href="#import">${icon('upload')}Importar estudantes</a>${state.user.role === 'admin' ? `<a class="nav-item ${active === 'team' ? 'active' : ''}" href="#team">${icon('shield')}Equipe da escola</a>` : ''}<a class="nav-item ${active === 'help' ? 'active' : ''}" href="#help">${icon('book')}Como usar</a></nav><div class="sidebar-foot"><p><span class="online-dot"></span>Dados salvos no servidor</p><strong>${esc(dash?.school || 'Ambiente escolar')}</strong><p>Conhecer para ensinar melhor.</p></div></aside><div class="workspace"><header class="topbar"><button class="quiet mobile-menu" id="menu" aria-label="Abrir ou fechar navegação" aria-expanded="false">${icon('menu')}</button><span class="breadcrumb">Escola / <strong>${{ home: 'Visão geral', exams: 'Simulados', classes: 'Turmas', reports: 'Relatórios', import: 'Importação', team: 'Equipe', help: 'Ajuda' }[active] || 'Simulado'}</strong></span><div class="account"><div class="avatar">${esc(state.user.name.slice(0, 1).toUpperCase())}</div><span>${esc(state.user.name)}</span><button id="logout" class="quiet" aria-label="Sair da conta">${icon('logout')}</button></div></header><main class="main" id="main" tabindex="-1"><div class="loading">Carregando…</div></main></div></div>`;
    $('#menu').onclick = () => {
        const isOpen = $('.sidebar').classList.toggle('open');
        $('#menu').setAttribute('aria-expanded', isOpen);
    };
    $('#logout').onclick = async () => {
        stopScanner();
        await api('logout', {});
        state.user = null;
        dash = null;
        studentsCache = [];
        renderAuth();
    };
}
function renderAuth() {
    stopScanner();
    const setup = !state.installed;
    $('#app').innerHTML =
        `<main class="auth-wrap" id="main"><section class="auth-card"><a class="brand" href="./"><img src="assets/icon.svg" alt="">MarioProvas</a><div class="eyebrow">Avaliar. Compreender. Avançar.</div><h1>${setup ? 'Prepare sua escola' : 'Bom ter você por aqui.'}</h1><p>${setup ? 'Cadastre a primeira conta com a chave configurada pelo responsável pela instalação.' : 'Entre para organizar suas avaliações e acompanhar a aprendizagem.'}</p><form id="auth">${setup ? field('key', 'Chave de instalação', 'password', 'required autocomplete="off"') + field('school', 'Nome da escola', 'text', 'required maxlength="180"') + field('name', 'Seu nome', 'text', 'required maxlength="180"') : ''}${field('email', 'E-mail', 'email', 'required autocomplete="username"')}${field('password', 'Senha', 'password', `required ${setup ? 'minlength="12"' : ''} maxlength="200" autocomplete="${setup ? 'new-password' : 'current-password'}"`)}<button type="submit">${setup ? 'Concluir instalação' : 'Entrar no MarioProvas'}${icon('arrow')}</button></form><details class="install-help"><summary>Instalar no celular</summary><p>No Android, use “Instalar app” no menu do navegador. No iPhone/iPad, abra no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. É necessário HTTPS e conexão para salvar dados.</p></details><p class="small muted" style="margin:22px 0 0">Acesso restrito à equipe autorizada da escola.</p></section></main>`;
    $('#auth').onsubmit = async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget,
            b = $('button[type=submit]', form);
        b.disabled = true;
        try {
            const data = Object.fromEntries(new FormData(form));
            const r = await api(setup ? 'setup' : 'login', data);
            if (setup) {
                state.installed = true;
                toast(r.message);
                renderAuth();
            } else {
                state.user = r.user;
                dash = null;
                await route();
            }
        } catch (e) {
            errorAt(form, e.message);
        } finally {
            b.disabled = false;
        }
    };
}
async function route() {
    stopScanner();
    if ($('#modal').open) $('#modal').close();
    const version = ++routeVersion;
    if (!state.user) {
        renderAuth();
        return;
    }
    const [view = 'home', id] = location.hash.slice(1).split('/'),
        active = ['exam', 'new', 'scan'].includes(view) ? 'exams' : view;
    shell(active);
    try {
        dash = await api('dashboard');
        if (version !== routeVersion) return;
        switch (view) {
            case 'home':
                home();
                break;
            case 'exams':
                examsView();
                break;
            case 'classes':
                await classesView(id);
                break;
            case 'import':
                importView();
                break;
            case 'new':
                await newExam();
                break;
            case 'exam':
                await examView(Number(id));
                break;
            case 'scan':
                await examView(Number(id), true);
                break;
            case 'reports':
                await reportsView(id);
                break;
            case 'team':
                await teamView();
                break;
            case 'help':
                helpView();
                break;
            default:
                location.hash = 'home';
        }
    } catch (e) {
        if (version === routeVersion && $('#main'))
            $('#main').innerHTML =
                `<div class="error" role="alert">${esc(e.message)}</div><a class="button secondary" href="#home">Voltar ao início</a>`;
    }
}
function examTable(exams) {
    return exams.length
        ? `<div class="table-wrap"><table><thead><tr><th>Simulado</th><th>Turma / data</th><th>Correções</th><th>Situação</th><th><span class="visually-hidden">Ações</span></th></tr></thead><tbody>${exams.map((e) => `<tr><td><strong>${esc(e.name)}</strong><small>${e.questions} questões</small></td><td>${esc(e.class_name)}<small>${dateFmt(e.date)}</small></td><td>${e.graded} de ${e.enrolled}<div class="progress"><span style="width:${e.enrolled ? (100 * e.graded) / e.enrolled : 0}%"></span></div></td><td><span class="badge ${e.graded === e.enrolled ? '' : 'warn'}">${e.graded === e.enrolled ? 'Concluído' : e.graded ? 'Em correção' : 'Aguardando leitura'}</span></td><td><a class="button quiet" href="#exam/${e.id}" aria-label="Abrir ${esc(e.name)}">${icon('arrow')}</a></td></tr>`).join('')}</tbody></table></div>`
        : empty('Sua próxima avaliação começa aqui', 'Importe os estudantes e crie o primeiro simulado.', 'exam');
}
function home() {
    const upcoming = dash.exams.filter((e) => e.graded < e.enrolled);
    $('#main').innerHTML =
        head(
            'Painel de acompanhamento',
            `Olá, ${state.user.name.split(' ')[0]}.`,
            'Um olhar sobre suas turmas, avaliações e próximas etapas.',
            `<a class="button" href="#new">${icon('plus')}Novo simulado</a>`,
        ) +
        `<div class="stats">${stat('Estudantes', dash.student_count, 'Cadastros da sua escola', 'users')}${stat('Turmas', dash.classes.length, 'Turmas disponíveis', 'book')}${stat('Simulados', dash.exams.length, `${upcoming.length} aguardando conclusão`, 'exam')}${stat('Cartões corrigidos', dash.result_count, 'Resultados completos salvos', 'scan')}</div><div class="grid-two"><div><section class="card welcome"><div class="eyebrow">Do papel à aprendizagem</div><h2>Menos tempo corrigindo.<br>Mais tempo ensinando.</h2><p>Crie a avaliação, imprima os cartões e deixe a câmera ajudar na correção. Cada resultado abre uma nova conversa sobre a aprendizagem.</p><a class="button" href="${dash.student_count ? '#new' : '#import'}">${icon(dash.student_count ? 'plus' : 'upload')}${dash.student_count ? 'Preparar uma avaliação' : 'Importar meus estudantes'}</a></section><section class="card"><div class="card-header"><div><h2>Seus simulados</h2><p>As avaliações mais recentes da escola</p></div><a class="button quiet" href="#exams">Ver todos ${icon('arrow')}</a></div>${examTable(dash.exams.slice(0, 5))}</section></div><div><section class="card"><div class="card-header"><h2>Um fluxo simples</h2>${icon('check')}</div><ol class="steps"><li><div><strong>Organize sua turma</strong><small>Importe o CSV e confira os cadastros.</small></div></li><li><div><strong>Prepare o simulado</strong><small>Defina áreas, questões e gabarito.</small></div></li><li><div><strong>Imprima e leia</strong><small>Capture as marcações com a câmera.</small></div></li><li><div><strong>Acompanhe os resultados</strong><small>Observe acertos, áreas e evolução.</small></div></li></ol><a class="button secondary" style="width:100%;margin-top:20px" href="#help">Conhecer o passo a passo</a></section><section class="card"><div class="eyebrow">Avaliação com contexto</div><h3>Cada turma tem uma história.</h3><p class="small muted">Use os indicadores como ponto de partida. A dificuldade de uma questão pode ter diferentes causas e merece ser investigada.</p><a class="button quiet" href="#reports">Explorar relatórios ${icon('arrow')}</a></section></div></div>`;
}
function examsView() {
    $('#main').innerHTML =
        head(
            'Planejamento e correção',
            'Simulados',
            'Uma disciplina ou várias áreas. Organize a avaliação do seu jeito.',
            `<a class="button" href="#new">${icon('plus')}Novo simulado</a>`,
        ) +
        `<section class="card"><div class="toolbar"><label class="visually-hidden" for="search">Buscar simulado</label><input id="search" placeholder="Buscar por nome ou turma…"></div><div id="exam-table">${examTable(dash.exams)}</div></section>`;
    $('#search').oninput = (e) =>
        ($('#exam-table').innerHTML = examTable(
            dash.exams.filter((x) =>
                (x.name + ' ' + x.class_name).toLocaleLowerCase().includes(e.target.value.toLocaleLowerCase()),
            ),
        ));
}
async function loadStudents() {
    studentsCache = await api('students');
    return studentsCache;
}
async function classesView(id) {
    await loadStudents();
    const cls = dash.classes.find((c) => c.id === Number(id));
    if (!cls) {
        $('#main').innerHTML =
            head(
                'Organização escolar',
                'Turmas e estudantes',
                'Cadastros preservados com o identificador do arquivo de origem.',
                `<a class="button" href="#import">${icon('upload')}Importar CSV</a>`,
            ) +
            `<div class="class-grid">${dash.classes.map((c) => `<section class="card"><span class="stat-icon" style="width:fit-content">${icon('users')}</span><h2>${esc(c.name)}</h2><p class="muted small">${c.students} estudantes</p><a class="button secondary" href="#classes/${c.id}">Abrir turma ${icon('arrow')}</a></section>`).join('')}</div>${dash.classes.length ? '' : empty('Nenhuma turma importada', 'Os nomes das turmas virão do CSV real.', 'users')}`;
        return;
    }
    $('#main').innerHTML =
        head(
            'Turmas e estudantes',
            cls.name,
            `${cls.students} estudantes cadastrados.`,
            `<a class="button secondary" href="#classes">Todas as turmas</a><a class="button" href="#new/${cls.id}">${icon('plus')}Criar avaliação</a>`,
        ) +
        `<section class="card"><div class="card-header"><h2>Simulados da turma</h2></div>${examTable(dash.exams.filter((e) => e.class_id === cls.id))}</section><section class="card"><div class="card-header"><h2>Estudantes</h2></div><div class="toolbar"><label class="visually-hidden" for="search">Buscar estudante</label><input id="search" placeholder="Buscar por nome ou identificador…"></div><div id="student-table"></div></section>`;
    const render = () => {
        const term = $('#search').value.toLocaleLowerCase();
        const ss = studentsCache.filter(
            (s) =>
                s.class_id === cls.id &&
                (s.name + ' ' + s.social_name + ' ' + s.external_id).toLocaleLowerCase().includes(term),
        );
        $('#student-table').innerHTML =
            `<div class="table-wrap"><table><thead><tr><th>Estudante</th><th>Identificador original</th><th>Cadastro</th></tr></thead><tbody>${ss.map((s) => `<tr><td><strong>${esc(displayName(s))}</strong>${s.social_name ? `<small>Nome civil: ${esc(s.name)}</small>` : ''}</td><td>${esc(s.external_id)}</td><td><button class="quiet" data-edit="${s.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>`;
        $$('[data-edit]').forEach(
            (b) => (b.onclick = () => editStudent(studentsCache.find((s) => s.id === Number(b.dataset.edit)))),
        );
    };
    $('#search').oninput = render;
    render();
}
function editStudent(s) {
    const m = openModal(
        `<div class="dialog-head"><h2>Conferir cadastro</h2><button class="quiet" data-close aria-label="Fechar">${icon('close')}</button></div><p class="small muted">Identificador preservado: ${esc(s.external_id)}</p><form id="edit-student">${field('name', 'Nome civil', 'text', 'required maxlength="180"')}${field('social_name', 'Nome social (opcional)', 'text', 'maxlength="180"')}<div class="field"><label for="class_id">Turma atual</label><select id="class_id" name="class_id">${dash.classes.map((c) => `<option value="${c.id}" ${s.class_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><p class="small muted">Mudar a turma não altera a participação em avaliações já criadas.</p><button type="submit">Salvar cadastro</button></form>`,
    );
    $('#name', m).value = s.name;
    $('#social_name', m).value = s.social_name;
    $('#edit-student').onsubmit = async (ev) => {
        ev.preventDefault();
        try {
            await api('student_update', { ...Object.fromEntries(new FormData(ev.currentTarget)), id: s.id });
            m.close();
            toast('Cadastro atualizado.');
            await route();
        } catch (e) {
            errorAt(ev.currentTarget, e.message);
        }
    };
}
function importView() {
    $('#main').innerHTML =
        head(
            'Seus dados, com conferência',
            'Importar estudantes',
            'Envie o CSV original. Nenhum registro é salvo antes da sua conferência.',
        ) +
        `<div class="grid-two"><section class="card"><div class="card-header"><div><h2>1. Selecione o arquivo</h2><p>CSV · até 8 MB · UTF-8 ou Windows-1252</p></div>${icon('upload')}</div><form id="upload"><div class="field"><label for="csv">Arquivo de estudantes</label><input id="csv" name="file" type="file" accept=".csv,text/csv" required></div><button type="submit">${icon('upload')}Analisar colunas</button></form><div id="mapping"></div></section><aside class="card"><div class="eyebrow">Importação cuidadosa</div><h2>Confira antes de confirmar.</h2><p class="small muted">Relacione as colunas de nome, identificador e turma. O nome social é opcional.</p><ol class="steps"><li><div><strong>Prontos</strong><small>Registros válidos, com identificador único.</small></div></li><li><div><strong>Inválidos</strong><small>Dados obrigatórios ausentes ou estrutura incorreta.</small></div></li><li><div><strong>Possíveis duplicados</strong><small>Identificador existente ou mesmo nome e turma. Serão ignorados até revisão.</small></div></li></ol><p class="note">O arquivo original é preservado. Endereços, telefones e dados dos responsáveis não são cadastrados.</p></aside></div><div id="preview"></div>`;
    $('#upload').onsubmit = async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget;
        const button = $('button', form);
        await busy(button, async () => {
            const r = await api('upload', new FormData(form));
            $('#preview').innerHTML = '';
            $('#mapping').innerHTML =
                `<div class="section-head"><h2>2. Relacione as colunas</h2></div><p class="small muted">${r.rows} registros encontrados. Separador: ${r.delimiter === '\t' ? 'tabulação' : esc(r.delimiter)}.</p><form id="map-form"><div class="form-grid">${[
                    ['external_id', 'Identificador / matrícula', false],
                    ['name', 'Nome do estudante', false],
                    ['class_name', 'Turma', false],
                    ['social_name', 'Nome social', true],
                ]
                    .map(
                        ([key, label, optional]) =>
                            `<div class="field"><label for="map-${key}">${label}${optional ? ' (opcional)' : ''}</label><select id="map-${key}" name="${key}" ${optional ? '' : 'required'}><option value="">${optional ? 'Não há esta coluna' : 'Selecione uma coluna'}</option>${r.headers.map((h, i) => `<option value="${i}" ${String(r.suggested[key]) === String(i) ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>`,
                    )
                    .join('')}</div><button type="submit">Conferir prévia ${icon('arrow')}</button></form>`;
            $('#map-form').onsubmit = async (e) => {
                e.preventDefault();
                await busy($('button', e.currentTarget), async () => {
                    const r = await api('preview', { mapping: Object.fromEntries(new FormData(e.currentTarget)) });
                    renderImportPreview(r);
                    $('#preview').scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            };
        });
    };
}
function renderImportPreview(r) {
    let page = 0;
    const size = 30;
    $('#preview').innerHTML =
        `<div class="stats">${stat('Prontos', r.counts.ready, 'Serão cadastrados', 'check')}${stat('Inválidos', r.counts.invalid, 'Serão ignorados', 'file')}${stat('Possíveis duplicados', r.counts.duplicate, 'Serão ignorados', 'users')}${stat('Total conferido', r.rows.length, 'Linhas de dados do CSV', 'exam')}</div><section class="card"><div class="card-header"><div><h2>3. Confira os registros</h2><p>Somente os registros prontos serão importados.</p></div><button id="commit-import" ${!r.counts.ready ? 'disabled' : ''}>Importar ${r.counts.ready} registros prontos</button></div><div class="toolbar"><label class="visually-hidden" for="import-filter">Situação</label><select id="import-filter"><option value="">Todas as situações</option value="ready">Prontos</option><option value="invalid">Inválidos</option><option value="duplicate">Possíveis duplicados</option></select></div><div id="import-table"></div><div class="actions" style="margin-top:18px"><button class="secondary" id="prev">Anterior</button><span id="page-info" class="small muted"></span><button class="secondary" id="next">Próxima</button></div></section>`;
    const render = () => {
        const rs = r.rows.filter((x) => !$('#import-filter').value || x.state === $('#import-filter').value);
        const pages = Math.max(1, Math.ceil(rs.length / size));
        page = Math.min(page, pages - 1);
        $('#import-table').innerHTML =
            `<div class="table-wrap"><table><thead><tr><th>Linha</th><th>Identificador</th><th>Estudante</th><th>Turma</th><th>Conferência</th></tr></thead><tbody>${rs
                .slice(page * size, (page + 1) * size)
                .map(
                    (s) =>
                        `<tr><td>${s.line}</td><td>${esc(s.external_id)}</td><td>${esc(s.social_name || s.name)}</td><td>${esc(s.class_name)}</td><td><span class="badge ${s.state === 'invalid' ? 'bad' : s.state === 'duplicate' ? 'warn' : ''}">${{ ready: 'Pronto', invalid: 'Inválido', duplicate: 'Possível duplicado' }[s.state]}</span><small>${s.issues.map(esc).join(' · ')}</small></td></tr>`,
                )
                .join('')}</tbody></table></div>`;
        $('#prev').disabled = page === 0;
        $('#next').disabled = page >= pages - 1;
        $('#page-info').textContent = `Página ${page + 1} de ${pages} · ${rs.length} registros`;
    };
    $('#import-filter').onchange = () => {
        page = 0;
        render();
    };
    $('#prev').onclick = () => {
        page--;
        render();
    };
    $('#next').onclick = () => {
        page++;
        render();
    };
    render();
    $('#commit-import').onclick = (e) =>
        busy(e.currentTarget, async () => {
            const out = await api('import', { nonce: r.nonce });
            toast(`${out.imported} estudantes importados. ${out.skipped} registros ignorados.`);
            dash = null;
            location.hash = 'classes';
        });
}
const initialAreas = ['Linguagens', 'Ciências Humanas', 'Ciências da Natureza', 'Matemática'];
async function newExam() {
    await loadStudents();
    if (!dash.classes.length) {
        $('#main').innerHTML =
            head('Planejamento', 'Novo simulado', 'Importe as turmas antes de criar sua primeira avaliação.') +
            `<section class="card">${empty('Comece pelos estudantes', 'As turmas e matrículas devem vir do CSV.', 'users')}<a class="button" href="#import">Importar CSV</a></section>`;
        return;
    }
    const currentClass = Number(location.hash.split('/')[1]) || dash.classes[0].id;
    let areas = [{ name: 'Linguagens', count: 10, answers: [] }],
        prepared = false;
    $('#main').innerHTML =
        head(
            'Planejamento',
            'Novo simulado',
            'Crie uma prova de uma disciplina ou combine áreas com quantidades diferentes.',
        ) +
        `<form id="new-exam"><div class="grid-two"><div><section class="card"><div class="card-header"><h2>Informações da avaliação</h2><span class="badge">1 / 3</span></div><div class="form-grid">${field('exam-name', 'Nome do simulado', 'text', 'required maxlength="180" placeholder="Nome da avaliação"')}${field('exam-date', 'Data', 'date', 'required')}<div class="field"><label for="exam-class">Turma</label><select id="exam-class" required>${dash.classes.map((c) => `<option value="${c.id}" ${c.id === currentClass ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label for="alternatives">Alternativas por questão</label><select id="alternatives">${[2, 3, 4, 5].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} alternativas (A–${String.fromCharCode(64 + n)})</option>`).join('')}</select></div></div></section><section class="card"><div class="card-header"><h2>Áreas e disciplinas</h2><span class="badge">2 / 3</span></div><p class="small muted">Escolha uma área do ENEM ou digite o nome de uma disciplina. Até 240 questões no total.</p><datalist id="area-options">${initialAreas.map((x) => `<option value="${x}">`).join('')}</datalist><div id="area-rows"></div><div class="actions"><button class="secondary" type="button" id="add-area">${icon('plus')}Adicionar área</button><button class="quiet" type="button" id="enem">Usar as quatro áreas ENEM</button></div><div class="note" id="total-questions"></div><button type="button" id="prepare-key">Montar gabarito ${icon('arrow')}</button><div id="key"></div></section></div><aside><section class="card"><div class="card-header"><h2>Participantes</h2><span class="badge">3 / 3</span></div><p class="small muted">Selecione os estudantes desta turma que farão a avaliação.</p><label class="check-row"><input id="all-students" type="checkbox" checked>Selecionar todos da turma</label><div class="check-list" id="enrollment"></div><p class="small muted" id="selected-count" style="margin-top:12px"></p></section><section class="card"><h3>Pronto para criar?</h3><p class="small muted">Confira o gabarito antes de salvar. Ele ficará fixo para manter a consistência dos cartões e resultados.</p><div id="create-error"></div><button type="submit" style="width:100%">${icon('check')}Criar simulado</button></section></aside></div></form>`;
    const now = new Date();
    $('#exam-date').value =
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const invalidate = () => {
        prepared = false;
        $('#key').innerHTML = '';
    };
    const updateTotal = () => {
        $('#total-questions').textContent =
            `${areas.reduce((s, a) => s + (Number(a.count) || 0), 0)} questões · ${areas.length} área(s) · até 60 questões por folha`;
    };
    const readAreas = () => {
        $$('[data-area]').forEach((row) => {
            const i = Number(row.dataset.area);
            areas[i].name = $('[data-area-name]', row).value;
            areas[i].count = Number($('[data-area-count]', row).value);
        });
    };
    const renderAreas = () => {
        $('#area-rows').innerHTML = areas
            .map(
                (a, i) =>
                    `<div class="area-row" data-area="${i}"><div><label for="area-${i}">Área / disciplina</label><input id="area-${i}" list="area-options" data-area-name value="${esc(a.name)}" maxlength="180" required></div><div><label for="count-${i}">Questões</label><input id="count-${i}" data-area-count type="number" min="1" max="240" value="${a.count}" required></div><button class="quiet danger" type="button" data-remove="${i}" aria-label="Remover área ${i + 1}" ${areas.length === 1 ? 'disabled' : ''}>${icon('close')}</button></div>`,
            )
            .join('');
        $$('[data-area] input').forEach(
            (i) =>
                (i.oninput = () => {
                    readAreas();
                    invalidate();
                    updateTotal();
                }),
        );
        $$('[data-remove]').forEach(
            (b) =>
                (b.onclick = () => {
                    readAreas();
                    areas.splice(Number(b.dataset.remove), 1);
                    invalidate();
                    renderAreas();
                }),
        );
        updateTotal();
    };
    renderAreas();
    $('#add-area').onclick = () => {
        readAreas();
        if (areas.length >= 30) {
            toast('Limite de 30 áreas.');
            return;
        }
        areas.push({ name: '', count: 1, answers: [] });
        invalidate();
        renderAreas();
    };
    $('#enem').onclick = () => {
        areas = initialAreas.map((name) => ({ name, count: 45, answers: [] }));
        invalidate();
        renderAreas();
    };
    $('#alternatives').onchange = invalidate;
    const updateCount = () => {
        $('#selected-count').textContent = `${$$('#enrollment input:checked').length} estudantes incluídos`;
    };
    const renderEnrollment = () => {
        const ss = studentsCache.filter((s) => s.class_id === Number($('#exam-class').value));
        $('#enrollment').innerHTML = ss
            .map(
                (s) =>
                    `<label class="check-row"><input type="checkbox" value="${s.id}" checked> ${esc(displayName(s))}<small>${esc(s.external_id)}</small></label>`,
            )
            .join('');
        $$('#enrollment input').forEach((x) => (x.onchange = updateCount));
        $('#all-students').checked = true;
        updateCount();
    };
    $('#exam-class').onchange = renderEnrollment;
    renderEnrollment();
    $('#all-students').onchange = (e) => {
        $$('#enrollment input').forEach((x) => (x.checked = e.target.checked));
        updateCount();
    };
    $('#prepare-key').onclick = () => {
        readAreas();
        if (
            areas.some((a) => !a.name.trim() || a.count < 1 || a.count > 240 || !Number.isInteger(a.count)) ||
            areas.reduce((s, a) => s + a.count, 0) > 240
        ) {
            toast('Confira nomes e quantidades. Limite total de 240 questões.');
            return;
        }
        const alt = Number($('#alternatives').value);
        let n = 0;
        $('#key').innerHTML =
            `<div class="section-head"><h2>Gabarito</h2><span class="badge">Preenchimento obrigatório</span></div>` +
            areas
                .map(
                    (a, i) =>
                        `<h3 style="margin:24px 0 12px">${esc(a.name)} · ${a.count} questões</h3><div class="answer-grid">${Array.from({ length: a.count }, (_, j) => `<div class="answer-field"><label for="answer-${i}-${j}">${++n}</label><select id="answer-${i}-${j}" data-answer-area="${i}" required><option value="">—</option>${Array.from({ length: alt }, (_, k) => `<option>${String.fromCharCode(65 + k)}</option>`).join('')}</select></div>`).join('')}</div>`,
                )
                .join('');
        prepared = true;
        $('#key').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('#new-exam').onsubmit = async (ev) => {
        ev.preventDefault();
        if (!prepared) {
            toast('Clique em Montar gabarito e preencha as alternativas.');
            return;
        }
        readAreas();
        areas.forEach((a, i) => (a.answers = $$(`[data-answer-area="${i}"]`).map((s) => s.value)));
        const button = $('button[type=submit]', ev.currentTarget);
        button.disabled = true;
        try {
            const r = await api('create_exam', {
                name: $('#exam-name').value,
                date: $('#exam-date').value,
                class_id: Number($('#exam-class').value),
                alternatives: Number($('#alternatives').value),
                areas,
                students: $$('#enrollment input:checked').map((i) => Number(i.value)),
            });
            toast('Simulado criado com gabarito e participantes.');
            location.hash = `exam/${r.id}`;
        } catch (e) {
            $('#create-error').innerHTML = `<div class="error" role="alert">${esc(e.message)}</div>`;
        } finally {
            button.disabled = false;
        }
    };
}
async function examView(id, startScan = false) {
    const e = await api('exam', undefined, { id });
    const completed = e.students.filter((s) => s.result_id).length;
    $('#main').innerHTML =
        head(
            'Aplicação e correção',
            e.name,
            `${e.class_name} · ${dateFmt(e.date)} · ${e.questions.length} questões · A–${String.fromCharCode(64 + e.alternatives)}`,
            `<a class="button secondary" href="#reports/${id}">${icon('chart')}Ver resultados</a><button id="scan">${icon('scan')}Ler cartões</button>`,
        ) +
        `<div class="stats">${stat('Participantes', e.students.length, 'Incluídos na avaliação', 'users')}${stat('Áreas', e.areas.length, 'Quantidades independentes', 'book')}${stat('Resultados', completed, `${e.students.length - completed} aguardando correção`, 'check')}${stat('Conjuntos gerados', e.booklets.length, `${Math.ceil(e.questions.length / 60)} folha(s) por conjunto`, 'print')}</div><div class="grid-two"><div><section class="card"><div class="card-header"><h2>Cartões-resposta</h2>${icon('print')}</div><p class="small muted">Cada conjunto tem um QR exclusivo por folha. O estudante será vinculado depois da leitura. Escreva o nome no campo impresso para conferir a associação.</p><form id="generate" class="toolbar"><label for="card-count">Conjuntos</label><input id="card-count" type="number" min="1" max="200" value="${Math.min(200, Math.max(1, e.students.length - e.booklets.length))}" style="max-width:110px" required><button type="submit">Gerar e abrir impressão</button></form>${
            e.booklets.length
                ? `<div class="table-wrap"><table><thead><tr><th>Conjunto</th><th>Estudante vinculado</th><th>Páginas lidas</th><th>Imprimir</th></tr></thead><tbody>${e.booklets
                      .map((b) => {
                          const s = e.students.find((s) => s.id === b.student_id);
                          return `<tr><td>#${b.id}</td><td>${s ? esc(displayName(s)) : '<span class="muted">Vincular na leitura</span>'}</td><td><span class="badge ${b.scanned < b.pages ? 'warn' : ''}">${b.scanned} / ${b.pages}</span></td><td><a class="button quiet" target="_blank" rel="noopener" href="print.html?exam=${id}&sets=${b.id}" aria-label="Imprimir conjunto ${b.id}">${icon('print')}</a></td></tr>`;
                      })
                      .join('')}</tbody></table></div>`
                : empty('Nenhum cartão gerado', 'Gere os conjuntos para imprimir as folhas de resposta.', 'print')
        }</section><section class="card"><div class="card-header"><h2>Participantes e resultados</h2></div><div class="table-wrap"><table><thead><tr><th>Estudante</th><th>Identificador</th><th>Resultado</th></tr></thead><tbody>${e.students.map((s) => `<tr><td>${esc(displayName(s))}</td><td>${esc(s.external_id)}</td><td>${s.result_id ? `<button class="quiet" data-result="${s.result_id}">Ver correção ${icon('arrow')}</button>` : `<span class="badge warn">${s.booklet_id ? 'Leitura parcial' : 'Pendente'}</span>`}</td></tr>`).join('')}</tbody></table></div></section></div><aside><section class="card"><div class="card-header"><h2>Áreas e gabarito</h2>${icon('exam')}</div>${e.areas.map((a) => `<div class="bar-label" style="padding:12px 0;border-bottom:1px solid var(--line)"><span>${esc(a.name)}</span><strong>${a.count} questões</strong></div>`).join('')}<details style="margin-top:22px"><summary class="link small">Conferir gabarito</summary><div class="report-questions" style="margin-top:16px">${e.questions.map((q) => `<div class="question-chip"><strong>${q.number} · ${q.answer}</strong><small>${esc(q.area)}</small></div>`).join('')}</div></details><p class="note">O gabarito é fixo. Caso esteja incorreto, crie uma nova avaliação antes de aplicar os cartões.</p></section><section class="card"><h3>Para uma leitura confiável</h3><p class="small muted">Use uma folha plana, boa iluminação e caneta preta. Enquadre as quatro marcas. Questões em branco ou com múltiplas marcações serão anuladas para aquele estudante.</p><p class="small muted">O acesso à câmera só é solicitado depois de você tocar em “Ativar câmera”.</p></section></aside></div>`;
    $('#generate').onsubmit = async (ev) => {
        ev.preventDefault();
        await busy($('button', ev.currentTarget), async () => {
            const r = await api('generate_cards', { exam_id: id, count: Number($('#card-count').value) });
            const url = `print.html?exam=${id}&sets=${r.booklets.join(',')}`;
            toast('Cartões gerados. A impressão está disponível abaixo.');
            await examView(id);
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.className = 'button lime';
            link.textContent = 'Abrir impressão do lote gerado';
            $('#generate').after(link);
            link.focus();
        });
    };
    $('#scan').onclick = () =>
        openScanner(e, {
            api,
            toast,
            openModal,
            icon,
            onSaved: () => {
                dash = null;
            },
        });
    $$('[data-result]').forEach((b) => (b.onclick = () => showIndividual(Number(b.dataset.result))));
    if (startScan)
        openScanner(e, {
            api,
            toast,
            openModal,
            icon,
            onSaved: () => {
                dash = null;
            },
        });
}
async function reportsView(id) {
    if (!id) {
        $('#main').innerHTML =
            head(
                'Indicadores de aprendizagem',
                'Relatórios',
                'Selecione uma avaliação para analisar os resultados da turma.',
            ) +
            `<section class="card">${dash.exams.length ? `<div class="table-wrap"><table><thead><tr><th>Avaliação</th><th>Turma</th><th>Resultados</th><th>Relatório</th></tr></thead><tbody>${dash.exams.map((e) => `<tr><td><strong>${esc(e.name)}</strong><small>${dateFmt(e.date)}</small></td><td>${esc(e.class_name)}</td><td>${e.graded} de ${e.enrolled}</td><td><a class="button secondary" href="#reports/${e.id}">Analisar ${icon('arrow')}</a></td></tr>`).join('')}</tbody></table></div>` : empty('Ainda não há avaliações', 'Os relatórios serão calculados com as leituras reais.', 'chart')}</section>`;
        return;
    }
    const r = await api('report', undefined, { id });
    const total = r.students.length,
        qs = r.questions,
        validQs = qs.filter((q) => q.total > 0 && q.correct + q.incorrect > 0);
    const ranked = [...validQs].sort(
        (a, b) => a.correct / (a.correct + a.incorrect) - b.correct / (b.correct + b.incorrect),
    );
    $('#main').innerHTML =
        head(
            'Indicadores de aprendizagem',
            r.exam.name,
            `${r.exam.class_name} · ${dateFmt(r.exam.date)} · ${total} resultados completos`,
            `<a class="button secondary" href="#exam/${id}">Abrir simulado</a><a class="button" href="api.php?action=export&id=${id}">${icon('upload')}Exportar CSV / Excel</a>`,
        ) +
        `<div class="stats">${stat('Média de acertos', decimal(r.mean_correct), 'Quantidade por estudante', 'check')}${stat('Média percentual', pct(r.mean_percentage), 'Média dos percentuais individuais', 'chart')}${stat(
            'Questões anuladas',
            r.students.reduce((s, x) => s + x.annulled, 0),
            'Branco ou múltiplas marcações',
            'file',
        )}${stat('Resultados completos', total, `${r.without_valid} sem questões válidas`, 'users')}</div><p class="note">Percentual = acertos ÷ questões válidas. Anuladas ficam fora de acertos e erros. A média percentual usa estudantes com pelo menos uma questão válida. Esta é uma correção por acertos; não calcula a nota TRI do ENEM.</p>${!total ? `<section class="card">${empty('Os resultados aparecerão após as leituras', 'Os conjuntos parcialmente lidos ficam pendentes até a última folha.', 'scan')}<a class="button" href="#scan/${id}">Iniciar leitura</a></section>` : ''}<div class="grid-two"><section class="card"><div class="card-header"><h2>Desempenho por área</h2><span class="badge">Somente questões válidas</span></div>${r.areas.length ? r.areas.map((a) => `<div class="bar-row"><div class="bar-label"><span>${esc(a.name)}</span><strong>${pct(a.mean_percentage)}</strong></div><div class="bar"><span style="width:${a.mean_percentage || 0}%"></span></div><small>Média de ${decimal(a.mean_correct)} acertos · ${a.correct} corretas / ${a.valid} válidas · ${a.annulled} anuladas</small></div>`).join('') : empty('Sem dados por área', 'Conclua a leitura de um conjunto.', 'chart')}</section><section class="card"><div class="card-header"><h2>Distribuição dos resultados</h2></div>${total ? `<div class="distribution">${r.distribution.map((n, i) => `<div class="bucket"><strong>${n}</strong><div class="column" style="height:${Math.max(2, (n / Math.max(1, ...r.distribution)) * 100)}px"></div><small>${i * 20}–${i === 4 ? '100' : (i + 1) * 20 + '−'}%</small></div>`).join('')}</div><p class="small muted" style="margin-top:20px">Quantidade de estudantes por faixa de acertos válidos. ${r.without_valid} sem percentual calculável.</p>` : empty('Sem distribuição', 'Aguardando resultados.', 'chart')}</section></div><section class="card"><div class="card-header"><h2>Pontos para investigar</h2></div>${ranked.length ? `<p class="small">Menor índice: <strong>questão ${ranked[0].number} · ${esc(ranked[0].area)}</strong>, ${pct((100 * ranked[0].correct) / (ranked[0].correct + ranked[0].incorrect))} (${ranked[0].correct} corretas em ${ranked[0].correct + ranked[0].incorrect} respostas válidas; ${ranked[0].blank + ranked[0].multiple} anuladas).</p><p class="small">Maior índice: <strong>questão ${ranked.at(-1).number} · ${esc(ranked.at(-1).area)}</strong>, ${pct((100 * ranked.at(-1).correct) / (ranked.at(-1).correct + ranked.at(-1).incorrect))} (${ranked.at(-1).correct} corretas em ${ranked.at(-1).correct + ranked.at(-1).incorrect} válidas).</p><p class="small muted">Pode ser útil revisar o enunciado e os conteúdos dessas questões com a turma. Estes números sugerem perguntas para investigação; não determinam a causa das dificuldades. Empates são apresentados pela ordem das questões.</p>` : empty('Aguardando evidências', 'Ainda não há respostas válidas para comparar.', 'book')}</section><section class="card"><div class="card-header"><h2>Resultados individuais</h2></div><div class="table-wrap"><table><thead><tr><th>Estudante</th><th>Acertos</th><th>Válidas</th><th>Anuladas</th><th>Percentual</th><th>Correção</th></tr></thead><tbody>${r.students.map((s) => `<tr><td><strong>${esc(displayName(s))}</strong><small>${esc(s.external_id)}</small></td><td>${s.correct}</td><td>${s.valid}</td><td>${s.annulled}</td><td>${pct(s.percentage)}</td><td><button class="quiet" data-result="${s.id}">Detalhar ${icon('arrow')}</button></td></tr>`).join('')}</tbody></table></div></section><section class="card"><div class="card-header"><h2>Análise por questão</h2><label for="question-order" class="visually-hidden">Ordenar questões</label><select id="question-order" style="max-width:220px"><option value="number">Ordem da prova</option><option value="asc">Menor índice de acerto</option><option value="desc">Maior índice de acerto</option></select></div><div id="question-table"></div></section><section class="card"><div class="card-header"><h2>Comparação entre simulados da turma</h2></div><p class="small muted">Compare considerando diferenças de conteúdo, dificuldade, participantes e quantidade de questões válidas.</p><div class="table-wrap"><table><thead><tr><th>Data / simulado</th><th>Participantes corrigidos</th><th>Média de acertos</th><th>Média percentual</th></tr></thead><tbody>${r.comparison.map((x) => `<tr><td><a href="#reports/${x.id}">${esc(x.name)}</a><small>${dateFmt(x.date)}</small></td><td>${x.total}</td><td>${decimal(x.mean_correct)}</td><td>${pct(x.mean_percentage)}</td></tr>`).join('')}</tbody></table></div></section><section class="card"><div class="card-header"><h2>Evolução por estudante</h2></div><label for="history-student">Estudante participante deste simulado</label><select id="history-student"><option value="">Selecione</option>${r.students.map((s) => `<option value="${s.student_id}">${esc(displayName(s))}</option>`).join('')}</select><div id="history" style="margin-top:20px"></div></section>${r.pending.length ? `<section class="card"><h2>Conjuntos pendentes</h2><p class="small muted">Não entram nas médias até todas as folhas serem lidas.</p><div class="table-wrap"><table><thead><tr><th>Conjunto</th><th>Estudante</th><th>Folhas lidas</th></tr></thead><tbody>${r.pending.map((p) => `<tr><td>#${p.id}</td><td>${p.name ? esc(displayName(p)) : 'A vincular'}</td><td>${p.scanned} / ${p.pages}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
    const renderQ = () => {
        const order = $('#question-order').value;
        const arr = [...qs];
        if (order !== 'number')
            arr.sort((a, b) => {
                const av = a.correct + a.incorrect ? (100 * a.correct) / (a.correct + a.incorrect) : -1,
                    bv = b.correct + b.incorrect ? (100 * b.correct) / (b.correct + b.incorrect) : -1;
                return order === 'asc' ? av - bv : bv - av;
            });
        $('#question-table').innerHTML =
            `<div class="table-wrap"><table><thead><tr><th>Questão / área</th><th>Corretas</th><th>Incorretas</th><th>Branco</th><th>Múltiplas</th><th>Válidas</th><th>Acerto válido</th></tr></thead><tbody>${arr.map((q) => `<tr><td><strong>${q.number} · Gabarito ${q.answer}</strong><small>${esc(q.area)}</small></td><td>${q.correct}</td><td>${q.incorrect}</td><td>${q.blank}</td><td>${q.multiple}</td><td>${q.correct + q.incorrect}</td><td>${pct(q.correct + q.incorrect ? (100 * q.correct) / (q.correct + q.incorrect) : null)}</td></tr>`).join('')}</tbody></table></div>`;
    };
    $('#question-order').onchange = renderQ;
    renderQ();
    $$('[data-result]').forEach((b) => (b.onclick = () => showIndividual(Number(b.dataset.result))));
    $('#history-student').onchange = (e) => {
        const h = r.history.filter((x) => x.student_id === Number(e.target.value));
        $('#history').innerHTML = h.length
            ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Simulado</th><th>Acertos / válidas</th><th>Anuladas</th><th>Percentual</th></tr></thead><tbody>${h.map((x) => `<tr><td>${dateFmt(x.date)}</td><td>${esc(x.name)}</td><td>${x.correct} / ${x.valid}</td><td>${x.annulled}</td><td>${pct(x.percentage)}</td></tr>`).join('')}</tbody></table></div><p class="small muted">A série usa datas de aplicação e pode reunir provas com conteúdos e dificuldades diferentes.</p>`
            : '';
    };
}
async function showIndividual(id) {
    try {
        const r = await api('individual', undefined, { id });
        const grouped = new Map();
        for (const q of r.responses) {
            const a = grouped.get(q.area) || { name: q.area, correct: 0, valid: 0, annulled: 0 };
            if (['blank', 'multiple'].includes(q.status)) a.annulled++;
            else {
                a.valid++;
                if (q.status === 'correct') a.correct++;
            }
            grouped.set(q.area, a);
        }
        const areas = [...grouped.values()];
        const ranked = areas.filter((a) => a.valid).sort((a, b) => b.correct / b.valid - a.correct / a.valid);
        const max = ranked[0],
            min = ranked.at(-1);
        const best = max
            ? ranked
                  .filter((a) => a.correct / a.valid === max.correct / max.valid)
                  .map((a) => a.name)
                  .join(', ')
            : 'Sem área com questões válidas';
        const worst = min
            ? ranked
                  .filter((a) => a.correct / a.valid === min.correct / min.valid)
                  .map((a) => a.name)
                  .join(', ')
            : 'Sem área com questões válidas';
        openModal(
            `<div class="dialog-head"><div><div class="eyebrow">Resultado individual</div><h2>${esc(displayName(r))}</h2><p class="small muted" style="margin:8px 0 0">${esc(r.exam_name)} · ${esc(r.external_id)}</p></div><button class="quiet" data-close aria-label="Fechar">${icon('close')}</button></div><div class="report-summary"><div>Acertos<strong>${r.correct} / ${r.valid} válidas</strong></div><div>Percentual<strong>${pct(r.percentage)}</strong></div><div>Anuladas<strong>${r.annulled}</strong></div></div><p class="note">Anuladas não contam como acertos nem erros. ${r.valid} questões válidas consideradas.</p><p class="small"><strong>Melhor área:</strong> ${esc(best)}<br><strong>Pior área:</strong> ${esc(worst)}</p>${areas.map((a) => `<div class="bar-row"><div class="bar-label"><span>${esc(a.name)}</span><strong>${pct(a.valid ? (100 * a.correct) / a.valid : null)}</strong></div><div class="bar"><span style="width:${a.valid ? (100 * a.correct) / a.valid : 0}%"></span></div><small>${a.correct} acertos / ${a.valid} válidas · ${a.annulled} anuladas</small></div>`).join('')}<h3 style="margin-top:28px">Correção por questão</h3><p class="small muted">Verde: correta · vermelho: incorreta · amarelo: anulada.</p><div class="report-questions">${r.responses.map((q) => `<div class="question-chip ${q.status}"><strong>Q${q.number}</strong><span>${{ correct: 'Correta', incorrect: 'Incorreta', blank: 'Em branco', multiple: 'Múltiplas' }[q.status]}</span><small>Leitura: ${esc(q.marked) || '—'}<br>Gabarito: ${q.answer}<br>${esc(q.area)}</small></div>`).join('')}</div>`,
        );
    } catch (e) {
        toast(e.message);
    }
}
async function teamView() {
    const users = await api('team');
    $('#main').innerHTML =
        head(
            'Acesso e responsabilidade',
            'Equipe da escola',
            'Os professores cadastrados acessam as turmas e os resultados desta escola.',
        ) +
        `<div class="grid-two"><section class="card"><h2>Usuários autorizados</h2><div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th></tr></thead><tbody>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Administrador' : 'Professor'}</td></tr>`).join('')}</tbody></table></div></section><section class="card"><h2>Adicionar professor</h2><p class="small muted">Use uma senha inicial forte e compartilhe-a por um canal seguro. Somente administradores criam contas.</p><form id="team-form">${field('name', 'Nome', 'text', 'required maxlength="180"')}${field('email', 'E-mail', 'email', 'required autocomplete="off"')}${field('password', 'Senha inicial', 'password', 'required minlength="12" maxlength="200" autocomplete="new-password"')}<button type="submit">Criar acesso</button></form></section></div>`;
    $('#team-form').onsubmit = async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget;
        try {
            const r = await api('team_create', Object.fromEntries(new FormData(form)));
            toast(r.message);
            await teamView();
        } catch (e) {
            errorAt(form, e.message);
        }
    };
}
function helpView() {
    $('#main').innerHTML =
        head(
            'Guia do professor',
            'Da turma ao resultado',
            'Um passo a passo para preparar a avaliação e corrigir os cartões.',
        ) +
        `<div class="grid-two"><section class="card"><ol class="steps"><li><div><strong>Importe o CSV</strong><small>Em Importar estudantes, envie o arquivo, relacione as colunas e confira a prévia. Prontos são cadastrados; inválidos e possíveis duplicados são ignorados.</small></div></li><li><div><strong>Crie a avaliação</strong><small>Escolha turma, participantes, áreas e quantidades. Para uma prova simples, mantenha uma única disciplina. Monte e confira todo o gabarito.</small></div></li><li><div><strong>Gere e imprima os cartões</strong><small>Abra o simulado e gere os conjuntos. Imprima em A4, escala 100%, sem cabeçalho/rodapé. Cada conjunto tem até quatro folhas, com 60 questões por folha. Não misture folhas de conjuntos diferentes.</small></div></li><li><div><strong>Oriente os estudantes</strong><small>Preencher toda a bolha com caneta preta, escrever o nome e manter as quatro marcas livres. Marcações em branco e múltiplas serão anuladas individualmente.</small></div></li><li><div><strong>Leia com a câmera</strong><small>Entre no simulado, toque em Ler cartões e depois em Ativar câmera. Use boa luz, folha plana e todas as marcas visíveis. Segure por alguns instantes. Confira a imagem lida e selecione o estudante para salvar.</small></div></li><li><div><strong>Continue sem reiniciar</strong><small>Toque em Próximo cartão. A câmera permanece ativa. Provas com mais de uma folha geram resultado somente depois da última página. Uma leitura inválida permanece pendente e deve ser repetida.</small></div></li><li><div><strong>Consulte os relatórios</strong><small>Veja desempenho individual, áreas, questões e evolução. Exporte o CSV para abrir no Excel. Os percentuais consideram apenas questões válidas.</small></div></li></ol></section><aside><section class="card"><h2>Se a câmera não ler</h2><p class="small muted">Limpe a lente, aproxime o cartão, ilumine sem reflexos e deixe margens ao redor da folha. Se o QR não for reconhecido, confira se a impressão está nítida. Use somente cartões gerados por esta instalação.</p><p class="note warn">É necessário HTTPS em produção e permissão do navegador. Para testes no mesmo computador, localhost é permitido. A aplicação não aceita digitação manual das respostas.</p></section><section class="card"><h2>Instalar no dispositivo</h2><p class="small muted">Android: menu do navegador → Instalar app / Adicionar à tela inicial.<br><br>iOS: Safari → Compartilhar → Adicionar à Tela de Início.</p>${installPrompt ? '<button id="install">Instalar MarioProvas</button>' : ''}<p class="small muted">A conexão é necessária para consultar e salvar dados. Os relatórios não ficam disponíveis offline.</p></section><section class="card"><h2>Privacidade</h2><p class="small muted">Os QR codes contêm apenas códigos aleatórios. Imagens são analisadas no dispositivo e descartadas ao fechar a leitura. Os resultados e medições ficam no servidor, com acesso restrito à escola.</p></section></aside></div>`;
    if ($('#install'))
        $('#install').onclick = async () => {
            await installPrompt.prompt();
            installPrompt = null;
        };
}
window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
});
window.addEventListener('hashchange', route);
window.addEventListener('pagehide', stopScanner);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopScanner();
});
try {
    state = await api('state');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (state.user) await route();
    else renderAuth();
} catch (e) {
    $('#app').innerHTML =
        `<main class="auth-wrap"><section class="auth-card"><h1>Não foi possível iniciar</h1><p>${esc(e.message)}</p><a class="button" href="./">Tentar novamente</a></section></main>`;
}
