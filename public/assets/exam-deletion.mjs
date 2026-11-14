import {escapeHtml as esc} from './layout.mjs?v=ui9';
export async function confirmExamDeletion(examId,ui){
    const summary=await ui.api('exam_deletion_preview',undefined,{exam_id:examId});
    const modal=ui.openModal(`<div class="dialog-head"><h2>Apagar simulado?</h2><button class="quiet" data-close aria-label="Cancelar exclusão">×</button></div><p><strong>${esc(summary.name)}</strong></p><p>Serão removidos ${summary.questions} questões da avaliação, ${summary.versions} versões, ${summary.cards} folhas de cartão e ${summary.results} resultados. Há ${summary.scanned_pages} folha(s) lida(s) e ${summary.participants} participante(s) vinculados.</p><p class="note warn">A exclusão é definitiva. O banco de questões e os cadastros de alunos e turmas são preservados. Cartões já impressos deste simulado deixarão de funcionar.</p><form id="delete-exam-form"><div class="actions"><button type="button" class="secondary" data-cancel-delete>Cancelar</button><button type="submit" id="confirm-delete-exam" class="danger">Apagar definitivamente</button></div><p id="delete-exam-error" role="alert"></p></form>`);
    modal.querySelector('[data-cancel-delete]').onclick=()=>modal.close();
    modal.querySelector('#delete-exam-form').onsubmit=async event=>{
        event.preventDefault();const button=modal.querySelector('#confirm-delete-exam');if(button.disabled)return;button.disabled=true;
        try{const result=await ui.api('delete_exam',{exam_id:examId,nonce:summary.nonce});modal.close();ui.toast(result.message);await ui.onDeleted();}
        catch(error){const box=modal.querySelector('#delete-exam-error');box.className='error';box.textContent=error.message;button.disabled=false;}
    };
}
