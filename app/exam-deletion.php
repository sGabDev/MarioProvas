<?php
declare(strict_types=1);

function exam_deletion_summary(int $examId): array {
    require_manager();$e=exam($examId);
    $counts=one('SELECT (SELECT COUNT(*) FROM questions WHERE exam_id=?) questions,(SELECT COUNT(*) FROM enrollments WHERE exam_id=?) participants,(SELECT COUNT(*) FROM booklets WHERE exam_id=?) booklets,(SELECT COUNT(*) FROM cards c JOIN booklets b ON b.id=c.booklet_id WHERE b.exam_id=?) cards,(SELECT COUNT(*) FROM cards c JOIN booklets b ON b.id=c.booklet_id WHERE b.exam_id=? AND c.scanned_at IS NOT NULL) scanned_pages,(SELECT COUNT(*) FROM results WHERE exam_id=?) results,(SELECT COUNT(*) FROM exam_versions WHERE exam_id=?) versions',array_fill(0,7,$examId));
    return ['id'=>$examId,'name'=>$e['name'],'revision'=>(int)$e['revision'],'pdf_revision'=>(int)$e['pdf_revision']]+$counts;
}
function preview_exam_deletion(int $examId): array {
    $u=require_manager();$summary=exam_deletion_summary($examId);$nonce=bin2hex(random_bytes(24));
    $_SESSION['exam_deletions'][$examId]=['nonce'=>$nonce,'user_id'=>$u['id'],'expires'=>time()+600,'fingerprint'=>hash('sha256',json_encode($summary))];
    if(count($_SESSION['exam_deletions'])>20)$_SESSION['exam_deletions']=array_slice($_SESSION['exam_deletions'],-20,null,true);
    return $summary+['nonce'=>$nonce];
}
function delete_exam(array $body): array {
    require_manager();$examId=(int)($body['exam_id']??0);
    $out=transaction(function()use($examId,$body){
        $u=require_manager();$summary=exam_deletion_summary($examId);$preview=$_SESSION['exam_deletions'][$examId]??null;
        if(!$preview||$preview['user_id']!==$u['id']||$preview['expires']<time()||!hash_equals($preview['nonce'],strval_trim($body['nonce']??'')))fail('Abra novamente a confirmação para apagar este simulado.',409);
        if(!hash_equals($preview['fingerprint'],hash('sha256',json_encode($summary))))fail('O simulado mudou desde a conferência. Reabra a confirmação para ver os dados atuais.',409);
        query('DELETE FROM responses WHERE result_id IN (SELECT id FROM results WHERE exam_id=?)',[$examId]);
        query('DELETE FROM results WHERE exam_id=?',[$examId]);
        query('DELETE FROM cards WHERE booklet_id IN (SELECT id FROM booklets WHERE exam_id=?)',[$examId]);
        query('DELETE FROM booklets WHERE exam_id=?',[$examId]);
        query('DELETE FROM version_questions WHERE version_id IN (SELECT id FROM exam_versions WHERE exam_id=?)',[$examId]);
        query('DELETE FROM exam_versions WHERE exam_id=?',[$examId]);
        query('DELETE FROM question_snapshots WHERE question_id IN (SELECT id FROM questions WHERE exam_id=?)',[$examId]);
        foreach(['questions','areas','enrollments','exam_classes'] as $table)query('DELETE FROM '.$table.' WHERE exam_id=?',[$examId]);
        query('DELETE FROM exams WHERE id=?',[$examId]);audit('exam.deleted',$examId);
        return ['message'=>'Simulado apagado. Seus cartões e resultados foram removidos.'];
    });unset($_SESSION['exam_deletions'][$examId]);return $out;
}
