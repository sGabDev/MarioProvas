import {escapeHtml as esc} from './layout.mjs?v=reader4';

export function buildAudience(classes,students,currentClass){
    const $=selector=>document.querySelector(selector);
    const $$=selector=>[...document.querySelectorAll(selector)];
    const grades=[...new Set(classes.map(c=>c.grade_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const choices=new Map();
    $('#audience').innerHTML=`<label for="exam-scope">Aplicar para</label><select id="exam-scope"><option value="classes">Uma ou mais turmas</option><option value="grade">Toda uma série / ano escolar</option></select><div id="class-picker" style="margin-top:14px"><label>Turmas participantes</label><div class="check-list">${classes.map(c=>`<label class="check-row"><input type="checkbox" data-class value="${c.id}" ${c.id===currentClass?'checked':''}><span>${esc(c.name)}<small style="display:block">${esc(c.grade_name||'Série não informada')}</small></span><small>${c.students} estudantes</small></label>`).join('')}</div></div><div id="grade-picker" style="margin-top:14px" hidden><label for="exam-grade">Série / ano escolar</label><select id="exam-grade"><option value="">Selecione uma série</option>${grades.map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('')}</select><p class="small muted">Serão incluídos todos os estudantes das turmas cadastradas nesta série. ${classes.some(c=>!c.grade_name)?'<a href="#classes">Informe a série das turmas sem esse cadastro.</a>':''}</p></div><p id="audience-summary" class="small muted" style="margin-top:12px"></p>`;
    const scope=()=>$('#exam-scope').value;
    const classIds=()=>scope()==='grade'?classes.filter(c=>c.grade_name===$('#exam-grade').value&&c.grade_name).map(c=>c.id):$$('[data-class]:checked').map(c=>Number(c.value));
    const included=()=>students.filter(s=>classIds().includes(s.class_id));
    const updateCount=()=>{
        const boxes=$$('#enrollment input');const n=boxes.filter(b=>b.checked).length;
        $('#selected-count').textContent=`${n} estudantes incluídos em ${classIds().length} turma(s)`;
        $('#audience-summary').textContent=scope()==='grade'?`${classIds().length} turma(s) da série selecionada · ${included().length} estudantes`:`${classIds().length} turma(s) selecionada(s)`;
        $('#all-students').checked=boxes.length>0&&n===boxes.length;
        $('#all-students').indeterminate=n>0&&n<boxes.length;
    };
    const render=()=>{
        const isGrade=scope()==='grade';$('#class-picker').hidden=isGrade;$('#grade-picker').hidden=!isGrade;
        $('#exam-grade').required=isGrade;$('#all-students').disabled=isGrade;
        const ss=included();
        $('#enrollment').innerHTML=ss.length?ss.map(s=>`<label class="check-row"><input type="checkbox" value="${s.id}" ${isGrade||choices.get(s.id)!==false?'checked':''} ${isGrade?'disabled':''}><span>${esc(s.social_name||s.name)}<small style="display:block">${esc(s.class_name)}</small></span><small>${esc(s.external_id)}</small></label>`).join(''):'<p class="small muted" style="padding:14px">Selecione as turmas ou uma série para incluir os estudantes.</p>';
        $$('#enrollment input').forEach(input=>input.onchange=()=>{choices.set(Number(input.value),input.checked);updateCount();});updateCount();
    };
    $$('[data-class]').forEach(c=>c.onchange=render);$('#exam-scope').onchange=render;$('#exam-grade').onchange=render;
    $('#all-students').onchange=event=>{$$('#enrollment input').forEach(input=>{input.checked=event.target.checked;choices.set(Number(input.value),input.checked);});updateCount();};
    render();
    return {request:()=>({scope:scope(),grade_name:$('#exam-grade').value,class_ids:classIds(),students:$$('#enrollment input:checked').map(input=>Number(input.value))})};
}
