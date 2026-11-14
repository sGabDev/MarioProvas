import {initializeUi,setupNavigation,describeModal} from './ui.mjs?v=ui9';
import {assessmentActions,openKeyEditor,openGradingEditor} from './assessment-view.mjs?v=bank3';
import {renderReport,individualHtml} from './report-view.mjs?v=bank1';
const reportFilters=new Map();
import {cardManagement} from './cards-view.mjs?v=bank1';
import {buildAudience} from './audience.mjs';
import {bankView,composeView,versionPanel,bindVersionPanel} from './bank-view.mjs?v=bank3';
import { escapeHtml as esc } from './layout.mjs?v=ui9';
import { openScanner, stopScanner } from './scanner.mjs?v=bank1';
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
    describeModal(m);
    if (!m.open) m.showModal();
    return m;
}
function shell(active) {
    $('#app').innerHTML =
        `<div class="shell"><aside class="sidebar" id="navigation" aria-label="Navegação principal"><div class="sidebar-brand"><a class="brand" href="#home"><img src="assets/icon.svg" alt="">MarioProvas</a><button class="quiet" id="close-menu" type="button" aria-label="Fechar menu">${icon('close')}</button></div><div class="nav-label">Espaço do professor</div><nav aria-label="Principal">${[
            ['home', 'Visão geral', 'home'],
            ['exams', 'Simulados', 'exam'],
            ['bank', 'Banco de questões', 'book'],
            ['compose', 'Montar prova', 'plus'],
            ['classes', 'Turmas e estudantes', 'users'],
            ['reports', 'Relatórios', 'chart'],
        ]
            .map(([r, l, i]) => `<a class="nav-item ${active === r ? 'active' : ''}" href="#${r}">${icon(i)}${l}</a>`)
            .join(
                '',
            )}<div class="nav-label">Organização</div><a class="nav-item ${active === 'import' ? 'active' : ''}" href="#import">${icon('upload')}Importar estudantes</a>${state.user.role === 'admin' ? `<a class="nav-item ${active === 'team' ? 'active' : ''}" href="#team">${icon('shield')}Equipe da escola</a>` : ''}<a class="nav-item ${active === 'help' ? 'active' : ''}" href="#help">${icon('book')}Como usar</a></nav><div class="sidebar-foot"><p><span class="online-dot"></span>Dados salvos no servidor</p><strong>${esc(dash?.school || 'Ambiente escolar')}</strong><p>Conhecer para ensinar melhor.</p></div></aside><button class="nav-backdrop" id="nav-backdrop" type="button" aria-label="Fechar menu" tabindex="-1" hidden></button><div class="workspace"><header class="topbar"><button class="quiet mobile-menu" id="menu" aria-label="Abrir ou fechar navegação" aria-expanded="false" aria-controls="navigation">${icon('menu')}</button><span class="breadcrumb">Escola / <strong>${{ home: 'Visão geral', exams: 'Simulados', bank: 'Banco de questões', compose: 'Montar prova', classes: 'Turmas', reports: 'Relatórios', import: 'Importação', team: 'Equipe', help: 'Ajuda' }[active] || 'Simulado'}</strong></span><div class="account"><div class="avatar">${esc(state.user.name.slice(0, 1).toUpperCase())}</div><span>${esc(state.user.name)}</span><button id="logout" class="quiet" aria-label="Sair da conta">${icon('logout')}</button></div></header><main class="main" id="main" tabindex="-1"><div class="loading">Carregando…</div></main></div></div>`;
    setupNavigation();
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
        `<main class="auth-wrap" id="main"><section class="auth-card"><a class="brand" href="./"><img src="assets/icon.svg" alt="">MarioProvas</a><div class="eyebrow">Avaliar. Compreender. Avançar.</div><h1>${setup ? 'Prepare sua escola' : 'Bom ter você por aqui.'}</h1><p>${setup ? 'Cadastre a primeira conta com a chave configurada pelo responsável pela instalação.' : 'Entre para organizar suas avaliações e acompanhar a aprendizagem.'}</p><form id="auth">${setup ? field('key', 'Chave de instalação', 'password', 'required autocomplete="off"') + field('school', 'Nome da escola', 'text', 'required maxlength="180"') + field('name', 'Seu nome', 'text', 'required maxlength="180"') : ''}${field('email', 'E-mail', 'email', 'required autocomplete="username"')}${field('password', 'Senha', 'password', `required ${setup ? 'minlength="12"' : ''} maxlength="200" autocomplete="${setup ? 'new-password' : 'current-password'}"`)}<button type="submit">${setup ? 'Concluir instalação' : 'Entrar no MarioProvas'}${icon('arrow')}</button></form><details class="install-help"><summary>Instalar no celular</summary><p>No Android, use “Instalar app” no menu do navegador. No iPhone/iPad, abra no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”. É necessário HTTPS e conexão para salvar dados.</p></details><p class="small muted auth-privacy">Acesso restrito à equipe autorizada da escola.</p></section></main>`;
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
            case 'bank':
                await bankView({root:$('#main'),api,toast,openModal});
                break;
            case 'compose':
                await composeView({root:$('#main'),api,toast,openModal,classes:dash.classes});
                break;
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
        `<div class="stats">${stat('Estudantes', dash.student_count, 'Cadastros da sua escola', 'users')}${stat('Turmas', dash.classes.length, 'Turmas disponíveis', 'book')}${stat('Simulados', dash.exams.length, `${upcoming.length} aguardando conclusão`, 'exam')}${stat('Cartões corrigidos', dash.result_count, 'Resultados completos salvos', 'scan')}</div><div class="grid-two"><div><section class="card welcome"><div class="eyebrow">Do papel à aprendizagem</div><h2>Menos tempo corrigindo.<br>Mais tempo ensinando.</h2><p>Crie a avaliação, imprima os cartões e deixe a câmera ajudar na correção. Cada resultado abre uma nova conversa sobre a aprendizagem.</p><a class="button" href="${dash.student_count ? '#new' : '#import'}">${icon(dash.student_count ? 'plus' : 'upload')}${dash.student_count ? 'Preparar uma avaliação' : 'Importar meus estudantes'}</a></section><section class="card"><div class="card-header"><div><h2>Seus simulados</h2><p>As avaliações mais recentes da escola</p></div><a class="button quiet" href="#exams">Ver todos ${icon('arrow')}</a></div>${examTable(dash.exams.slice(0, 5))}</section></div><div><section class="card"><div class="card-header"><h2>Um fluxo simples</h2>${icon('check')}</div><ol class="steps"><li><div><strong>Organize sua turma</strong><small>Importe o CSV e confira os cadastros.</small></div></li><li><div><strong>Prepare o simulado</strong><small>Defina áreas, questões e gabarito.</small></div></li><li><div><strong>Imprima e leia</strong><small>Capture as marcações com a câmera.</small></div></li><li><div><strong>Acompanhe os resultados</strong><small>Observe acertos, áreas e evolução.</small></div></li></ol><a class="button secondary button-block space-before" href="#help">Conhecer o passo a passo</a></section><section class="card"><div class="eyebrow">Avaliação com contexto</div><h3>Cada turma tem uma história.</h3><p class="small muted">Use os indicadores como ponto de partida. A dificuldade de uma questão pode ter diferentes causas e merece ser investigada.</p><a class="button quiet" href="#reports">Explorar relatórios ${icon('arrow')}</a></section></div></div>`;
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
            `<div class="class-grid">${dash.classes.map((c) => `<section class="card"><span class="stat-icon">${icon('users')}</span><h2>${esc(c.name)}</h2><p class="muted small">${c.students} estudantes · ${esc(c.grade_name || 'Série não informada')}</p><a class="button secondary" href="#classes/${c.id}">Abrir turma ${icon('arrow')}</a></section>`).join('')}</div>${dash.classes.length ? '' : empty('Nenhuma turma importada', 'Os nomes das turmas virão do CSV real.', 'users')}`;
        return;
    }
    $('#main').innerHTML =
        head(
            'Turmas e estudantes',
            cls.name,
            `${cls.students} estudantes cadastrados. ${cls.grade_name || 'Série não informada.'}`,
            `<a class="button secondary" href="#classes">Todas as turmas</a><button class="secondary" id="edit-grade">Definir série</button><a class="button" href="#new/${cls.id}">${icon('plus')}Criar avaliação</a>`,
        ) +
        `<section class="card"><div class="card-header"><h2>Simulados da turma</h2></div>${examTable(dash.exams.filter((e) => e.class_ids.includes(cls.id)))}</section><section class="card"><div class="card-header"><h2>Estudantes</h2></div><div class="toolbar"><label class="visually-hidden" for="search">Buscar estudante</label><input id="search" placeholder="Buscar por nome ou identificador…"></div><div id="student-table"></div></section>`;
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
    $('#edit-grade').onclick = () => editGrade(cls);
    $('#search').oninput = render;
    render();
}
function editGrade(cls) {
    const m = openModal(`<div class="dialog-head"><h2>Série / ano escolar da turma</h2><button class="quiet" data-close aria-label="Fechar">${icon('close')}</button></div><p class="small muted">${esc(cls.name)} · Use o mesmo nome de série nas turmas que devem ser agrupadas.</p><form id="edit-grade-form"><div class="field"><label for="grade-name">Série / ano escolar</label><input id="grade-name" name="grade_name" maxlength="180" list="known-grades"><datalist id="known-grades">${[...new Set(dash.classes.map(c=>c.grade_name).filter(Boolean))].map(g=>`<option value="${esc(g)}">`).join('')}</datalist></div><button type="submit">Salvar série da turma</button></form>`);
    $('#grade-name',m).value=cls.grade_name||'';
    $('#edit-grade-form').onsubmit=async event=>{event.preventDefault();const button=$('button[type=submit]',event.currentTarget);button.disabled=true;try{await api('class_update',{id:cls.id,grade_name:$('#grade-name',m).value});m.close();toast('Série atualizada.');await route();}catch(e){errorAt(event.currentTarget,e.message);}finally{button.disabled=false;}};
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
                    ['grade_name', 'Série / ano escolar', true],
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
        `<div class="stats">${stat('Prontos', r.counts.ready, 'Serão cadastrados', 'check')}${stat('Inválidos', r.counts.invalid, 'Serão ignorados', 'file')}${stat('Possíveis duplicados', r.counts.duplicate, 'Serão ignorados', 'users')}${stat('Total conferido', r.rows.length, 'Linhas de dados do CSV', 'exam')}</div><section class="card"><div class="card-header"><div><h2>3. Confira os registros</h2><p>Somente os registros prontos serão importados. ${r.grade_updates || 0} turma(s) receberão a série informada, sem duplicar estudantes já cadastrados.</p></div><button id="commit-import" ${!r.counts.ready && !r.grade_updates ? 'disabled' : ''}>Importar ${r.counts.ready} registros / atualizar séries</button></div><div class="toolbar"><label class="visually-hidden" for="import-filter">Situação</label><select id="import-filter"><option value="">Todas as situações</option value="ready">Prontos</option><option value="invalid">Inválidos</option><option value="duplicate">Possíveis duplicados</option></select></div><div id="import-table"></div><div class="actions space-before"><button class="secondary" id="prev">Anterior</button><span id="page-info" class="small muted"></span><button class="secondary" id="next">Próxima</button></div></section>`;
    const render = () => {
        const rs = r.rows.filter((x) => !$('#import-filter').value || x.state === $('#import-filter').value);
        const pages = Math.max(1, Math.ceil(rs.length / size));
        page = Math.min(page, pages - 1);
        $('#import-table').innerHTML =
            `<div class="table-wrap"><table><thead><tr><th>Linha</th><th>Identificador</th><th>Estudante</th><th>Turma / série</th><th>Conferência</th></tr></thead><tbody>${rs
                .slice(page * size, (page + 1) * size)
                .map(
                    (s) =>
                        `<tr><td>${s.line}</td><td>${esc(s.external_id)}</td><td>${esc(s.social_name || s.name)}</td><td>${esc(s.class_name)}<small>${esc(s.grade_name)}</small></td><td><span class="badge ${s.state === 'invalid' ? 'bad' : s.state === 'duplicate' ? 'warn' : ''}">${{ ready: 'Pronto', invalid: 'Inválido', duplicate: 'Possível duplicado' }[s.state]}</span><small>${s.issues.map(esc).join(' · ')}</small></td></tr>`,
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
            toast(`${out.imported} estudantes importados. ${out.skipped} registros ignorados. ${out.grades_updated || 0} séries de turmas atualizadas.`);
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
        `<form id="new-exam"><div class="grid-two"><div><section class="card"><div class="card-header"><h2>Informações da avaliação</h2><span class="badge">1 / 3</span></div><div class="form-grid">${field('exam-name', 'Nome do simulado', 'text', 'required maxlength="180" placeholder="Nome da avaliação"')}${field('exam-date', 'Data', 'date', 'required')}<div class="field full" id="audience"></div><div class="field"><label for="alternatives">Alternativas por questão</label><select id="alternatives">${[2, 3, 4, 5].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n} alternativas (A–${String.fromCharCode(64 + n)})</option>`).join('')}</select></div></div></section><section class="card"><div class="card-header"><h2>Áreas e disciplinas</h2><span class="badge">2 / 3</span></div><p class="small muted">Escolha uma área do ENEM ou digite o nome de uma disciplina. Até 240 questões no total.</p><datalist id="area-options">${initialAreas.map((x) => `<option value="${x}">`).join('')}</datalist><div id="area-rows"></div><div class="actions"><button class="secondary" type="button" id="add-area">${icon('plus')}Adicionar área</button><button class="quiet" type="button" id="enem">Usar as quatro áreas ENEM</button></div><div class="note" id="total-questions"></div><button type="button" id="prepare-key">Montar gabarito ${icon('arrow')}</button><div id="key"></div></section></div><aside><section class="card"><div class="card-header"><h2>Participantes</h2><span class="badge">3 / 3</span></div><p class="small muted">Escolha as turmas ou a série e confira os estudantes incluídos.</p><label class="check-row"><input id="all-students" type="checkbox" checked>Selecionar todos das turmas escolhidas</label><div class="check-list" id="enrollment"></div><p class="small muted space-before-sm" id="selected-count"></p></section><section class="card"><h3>Pronto para criar?</h3><p class="small muted">Confira o gabarito antes de salvar. Depois, você pode editá-lo, anular questões para todos e configurar as notas. Os resultados serão recalculados.</p><div id="create-error"></div><button type="submit" class="button-block">${icon('check')}Criar simulado</button></section></aside></div></form>`;
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
    const audience = buildAudience(dash.classes, studentsCache, currentClass);
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
                        `<h3 class="section-title">${esc(a.name)} · ${a.count} questões</h3><div class="answer-grid">${Array.from({ length: a.count }, (_, j) => `<div class="answer-field"><label for="answer-${i}-${j}">${++n}</label><select id="answer-${i}-${j}" data-answer-area="${i}" required><option value="">—</option>${Array.from({ length: alt }, (_, k) => `<option>${String.fromCharCode(65 + k)}</option>`).join('')}</select></div>`).join('')}</div>`,
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
                ...audience.request(),
                alternatives: Number($('#alternatives').value),
                areas,
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
        `<div class="stats">${stat('Participantes', e.students.length, 'Incluídos na avaliação', 'users')}${stat('Áreas', e.areas.length, 'Quantidades independentes', 'book')}${stat('Resultados', completed, `${e.students.length - completed} aguardando correção`, 'check')}${stat('Modelos / cartões', e.booklets.length, `${Math.ceil(e.questions.length / 60)} folha(s) por conjunto`, 'print')}</div><div class="grid-two"><div>${cardManagement(e, icon)}<section class="card"><div class="card-header"><h2>Participantes e resultados</h2></div><div class="table-wrap"><table><thead><tr><th>Estudante / turma</th><th>Identificador</th><th>Resultado</th></tr></thead><tbody>${e.students.map((s) => `<tr><td>${esc(displayName(s))}<small>${esc(s.class_name)}</small></td><td>${esc(s.external_id)}</td><td>${s.result_id ? `<button class="quiet" data-result="${s.result_id}">Ver correção ${icon('arrow')}</button>` : `<span class="badge warn">${s.booklet_id ? 'Leitura parcial' : 'Pendente'}</span>`}</td></tr>`).join('')}</tbody></table></div></section></div><aside><section class="card"><div class="card-header"><h2>${e.versions?.length?'Gabarito de referência':'Áreas e gabarito'}</h2>${icon('exam')}</div>${e.areas.map((a) => `<div class="bar-label area-summary"><span>${esc(a.name)}</span><strong>${a.count} questões</strong></div>`).join('')}<details class="space-before"><summary class="link small">${e.versions?.length?'Conferir ordem original da seleção':'Conferir gabarito'}</summary><div class="report-questions space-before">${e.questions.map((q) => `<div class="question-chip"><strong>${q.number} · ${q.annulled?'Anulada':q.answer}</strong><small>${esc(q.area)}</small></div>`).join('')}</div></details>${assessmentActions(e)}</section><section class="card"><h3>Para uma leitura confiável</h3><p class="small muted">Use uma folha plana, boa iluminação e caneta de cor nítida. Enquadre as quatro marcas. Questões em branco ou com múltiplas marcações contam como incorretas. Só você pode anular uma questão para todos.</p><p class="small muted">O acesso à câmera só é solicitado depois de você tocar em “Ativar câmera”.</p></section></aside></div>`;
    const assessmentUi={api,toast,openModal,onSaved:async()=>{dash=null;await examView(id);}};
    if(e.versions?.length){
        const panel=document.createElement('div');panel.innerHTML=versionPanel(e);$('.stats').after(panel);
        bindVersionPanel(e,assessmentUi);
    }
    $('#edit-key').onclick=()=>openKeyEditor(e,assessmentUi);
    $('#edit-grading').onclick=()=>openGradingEditor(e,assessmentUi);
    $('#generate').onsubmit = async (ev) => {
        ev.preventDefault();
        await busy($('button', ev.currentTarget), async () => {
            const r = await api('generate_cards', { exam_id: id, reusable: true });
            const url = `print?exam=${id}&sets=${r.booklets.join(',')}`;
            toast('Modelo reutilizável pronto. Use as mesmas páginas para os participantes.');
            await examView(id);
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.className = 'button lime';
            link.textContent = 'Abrir impressão do modelo reutilizável';
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
                'Selecione uma avaliação para analisar os resultados das turmas participantes.',
            ) +
            `<section class="card">${dash.exams.length ? `<div class="table-wrap"><table><thead><tr><th>Avaliação</th><th>Turma</th><th>Resultados</th><th>Relatório</th></tr></thead><tbody>${dash.exams.map((e) => `<tr><td><strong>${esc(e.name)}</strong><small>${dateFmt(e.date)}</small></td><td>${esc(e.class_name)}</td><td>${e.graded} de ${e.enrolled}</td><td><a class="button secondary" href="#reports/${e.id}">Analisar ${icon('arrow')}</a></td></tr>`).join('')}</tbody></table></div>` : empty('Ainda não há avaliações', 'Os relatórios serão calculados com as leituras reais.', 'chart')}</section>`;
        return;
    }
    const filters=reportFilters.get(id)||{class_id:0,grade_name:''};
    const r=await api('report',undefined,{id,...filters});
    if(reportFilters.get(id)&&JSON.stringify(reportFilters.get(id))!==JSON.stringify(filters))return;
    renderReport(r,{root:$('#main'),head,stat,icon,onIndividual:showIndividual,onFilter:async next=>{reportFilters.set(id,next);try{await reportsView(id);}catch(error){toast(error.message);}}});
}
async function showIndividual(id){
    try{const r=await api('individual',undefined,{id});openModal(individualHtml(r));}catch(error){toast(error.message);}
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
        `<div class="grid-two"><section class="card"><ol class="steps"><li><div><strong>Importe o CSV</strong><small>Em Importar estudantes, envie o arquivo, relacione as colunas e confira a prévia. Prontos são cadastrados; inválidos e possíveis duplicados são ignorados.</small></div></li><li><div><strong>Crie a avaliação</strong><small>Escolha uma ou mais turmas, ou toda uma série, e defina áreas e quantidades. Para uma prova simples, mantenha uma única disciplina. Monte e confira todo o gabarito.</small></div></li><li><div><strong>Gere e imprima os cartões</strong><small>Abra o simulado, gere o modelo e clique em PNG / imprimir. Baixe o compacto em PNG de 300 ou 600 dpi e insira na capa com a largura indicada, mantendo a proporção. Cada bloco tem até 60 questões; provas maiores usam mais blocos do mesmo modelo. A opção A4 continua disponível. O mesmo QR serve para vários estudantes.</small></div></li><li><div><strong>Oriente os estudantes</strong><small>Preencher toda a bolha com caneta de cor nítida, escrever o nome e manter as quatro marcas livres. Branco e múltiplas marcações contam como erro; anulações são definidas no gabarito para todos.</small></div></li><li><div><strong>Leia com a câmera</strong><small>Entre no simulado, toque em Ler cartões e depois em Ativar câmera. Use boa luz, papel plano e as quatro marcas do cartão visíveis. Na capa, enquadre apenas o cartão inteiro. Segure por alguns instantes. Confira a imagem lida e selecione o estudante para salvar.</small></div></li><li><div><strong>Continue sem reiniciar</strong><small>Depois de salvar, retire a folha anterior. A próxima leitura começa automaticamente e a câmera permanece ativa. Provas com mais de uma folha geram resultado somente depois da última página. Uma leitura inválida permanece pendente e deve ser repetida.</small></div></li><li><div><strong>Consulte os relatórios</strong><small>Veja desempenho individual, áreas, questões e evolução. Exporte o CSV para abrir no Excel. Filtre por turma ou série. Os percentuais incluem os créditos das questões anuladas para todos. Configure faixas de notas e edite o gabarito na tela do simulado.</small></div></li></ol></section><aside><section class="card"><h2>Se a câmera não ler</h2><p class="small muted">Limpe a lente, aproxime o cartão, ilumine sem reflexos e deixe margens ao redor da folha. Se o QR não for reconhecido, confira se a impressão está nítida. Use somente cartões gerados por esta instalação.</p><p class="note warn">É necessário HTTPS em produção e permissão do navegador. Para testes no mesmo computador, localhost é permitido. A aplicação não aceita digitação manual das respostas.</p></section><section class="card"><h2>Instalar no dispositivo</h2><p class="small muted">Android: menu do navegador → Instalar app / Adicionar à tela inicial.<br><br>iOS: Safari → Compartilhar → Adicionar à Tela de Início.</p>${installPrompt ? '<button id="install">Instalar MarioProvas</button>' : ''}<p class="small muted">A conexão é necessária para consultar e salvar dados. Os relatórios não ficam disponíveis offline.</p></section><section class="card"><h2>Privacidade</h2><p class="small muted">Os QR codes contêm apenas códigos aleatórios. Imagens são analisadas no dispositivo e descartadas ao fechar a leitura. Os resultados e medições ficam no servidor, com acesso restrito à escola.</p></section></aside></div>`;
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
initializeUi();
try {
    state = await api('state');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (state.user) await route();
    else renderAuth();
} catch (e) {
    $('#app').innerHTML =
        `<main class="auth-wrap"><section class="auth-card"><h1>Não foi possível iniciar</h1><p>${esc(e.message)}</p><a class="button" href="./">Tentar novamente</a></section></main>`;
}
