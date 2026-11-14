<?php
declare(strict_types=1);
function marks_from_scores(array $scores, int $alternatives): array
{
    $marks = [];
    foreach ($scores as $row) {
        if (!is_array($row) || count($row) !== $alternatives)
            fail('Medições ópticas incompletas. Leia novamente.');
        $m = [];
        foreach (array_values($row) as $i => $score) {
            if (!is_numeric($score) || !is_finite((float) $score) || $score < 0 || $score > 1)
                fail('Medição óptica inválida.');
            if ($score > 0.20 && $score < 0.44)
                fail('Preenchimento ambíguo. Reforce as marcações e leia novamente.');
            if ($score >= 0.44)
                $m[] = chr(65 + $i);
        }
        $marks[] = $m;
    }
    return $marks;
}
function calculate_result(array $questions, array $marks, string $annulmentMode='credit'): array
{
    if (count($questions) !== count($marks))
        fail('Cartão incompleto.');
    $correct = 0;
    $valid = 0;
    $annulled = 0;
    $credited = 0;
    $responses = [];
    foreach ($questions as $i => $q) {
        $m = $marks[$i];
        if (!empty($q['annulled'])) {
            $status = 'annulled';
            $annulled++;
            if($annulmentMode==='credit')$credited++;
        } else {
            $valid++;
            $status = count($m)===0?'blank':(count($m)>1?'multiple':($m[0] === $q['answer'] ? 'correct' : 'incorrect'));
            if ($status === 'correct')
                $correct++;
        }
        $responses[] = ['question_id' => $q['id'], 'marked' => implode(',', $m), 'status' => $status];
    }
    $considered=$valid+$credited;
    return ['correct'=>$correct,'valid'=>$valid,'annulled'=>$annulled,'credited'=>$credited,'considered'=>$considered,'incorrect'=>$valid-$correct,'percentage'=>$considered?round(100*($correct+$credited)/$considered,2):null,'responses'=>$responses];
}
function identify_card(string $token, int $examId): array
{
    $e = exam($examId);
    $u = require_user();
    $c = one('SELECT c.*,b.exam_id,b.student_id,b.id booklet,b.reusable,b.template_id,b.version_id,v.label version_label,e.school_id FROM cards c JOIN booklets b ON b.id=c.booklet_id JOIN exams e ON e.id=b.exam_id LEFT JOIN exam_versions v ON v.id=b.version_id WHERE c.token=? AND e.school_id=?', [$token, $u['school_id']]);
    if (!$c)
        fail('QR desconhecido. O cartão não foi identificado.', 404);
    if ((int) $c['exam_id'] !== $examId)
        fail('Este cartão pertence a outro simulado.', 409);
    if ($c['scanned_at'] && !$c['reusable'])
        fail('Cartão já processado. Nenhum resultado foi duplicado.', 409);
    return $c;
}
function save_scan(int $examId, string $token, int $studentId, array $scores, array $quality, ?array $identity=null): array
{
    return transaction(function () use ($examId, $token, $studentId, $scores, $quality, $identity) {
        $c = identify_card($token, $examId);
        $e = exam($examId);
        $u = require_user();
        if (($quality['markerCount'] ?? 0) !== 4 || ($quality['contrast'] ?? 0) < 90 || ($quality['sharpness'] ?? 0) < 55 || ($quality['coverage'] ?? 0) < 0.12)
            fail('Qualidade insuficiente. Enquadre o cartão e repita a leitura.');
        if (count($scores) !== (int) $c['question_count'])
            fail('Número de questões lidas não confere.');
        marks_from_scores($scores, (int) $e['alternatives']);
        if (!one('SELECT 1 FROM enrollments WHERE exam_id=? AND student_id=?', [$examId, $studentId]))
            fail('Estudante não incluído neste simulado.');
        $idReading=validate_student_identity($examId,$studentId,$identity);
        if (one('SELECT id FROM results WHERE exam_id=? AND student_id=?', [$examId, $studentId]))
            fail('Este estudante já tem resultado neste simulado. Nenhum resultado foi duplicado.', 409);
        $templateId = $c['reusable'] ? (int)$c['booklet'] : null;
        if ($templateId) {
            $attempt = one('SELECT id,template_id FROM booklets WHERE exam_id=? AND student_id=?', [$examId, $studentId]);
            if ($attempt && (int)$attempt['template_id'] !== $templateId)
                fail('Este estudante iniciou outro conjunto. Use o modelo correspondente para concluir as páginas.', 409);
            if (!$attempt) {
                query('INSERT INTO booklets(exam_id,student_id,template_id,version_id) VALUES(?,?,?,?)', [$examId, $studentId, $templateId, $c['version_id']]);
                $attempt = ['id'=>(int)db()->lastInsertId()];
                foreach(rows('SELECT page,start_number,question_count FROM cards WHERE booklet_id=? ORDER BY page',[$templateId]) as $page) {
                    // As medições de cada estudante têm seus próprios registros;
                    // o QR impresso e o modelo continuam livres para outras leituras.
                    query('INSERT INTO cards(booklet_id,token,page,start_number,question_count) VALUES(?,?,?,?,?)',[$attempt['id'],bin2hex(random_bytes(16)),$page['page'],$page['start_number'],$page['question_count']]);
                }
            }
            $c = one('SELECT c.*,b.exam_id,b.student_id,b.id booklet FROM cards c JOIN booklets b ON b.id=c.booklet_id WHERE c.booklet_id=? AND c.page=?',[$attempt['id'],$c['page']]);
            if (!$c || $c['scanned_at']) fail('Esta folha já foi salva para este estudante. Leia a próxima folha ou escolha outro aluno.',409);
        }
        if ($c['student_id'] && (int) $c['student_id'] !== $studentId)
            fail('As páginas deste conjunto já foram vinculadas a outro estudante.', 409);
        if (one('SELECT id FROM booklets WHERE exam_id=? AND student_id=? AND id<>?', [$examId, $studentId, $c['booklet']]))
            fail('Estudante já vinculado a outro conjunto. Use as páginas desse conjunto.', 409);
        query('UPDATE booklets SET student_id=? WHERE id=?', [$studentId, $c['booklet']]);
        query('UPDATE cards SET scores=?,scanned_at=CURRENT_TIMESTAMP,scanned_by=?,student_id_scores=?,detected_external_id=?,identity_method=?,id_status=? WHERE id=?', [json_encode($scores),$u['id'],$idReading['scores']===null?null:json_encode($idReading['scores']),$idReading['value'],$idReading['method'],$idReading['status'],$c['id']]);
        if($identity!==null)audit($idReading['method']==='confirmed'?'card.id_confirmed':($idReading['value']!==null?'card.id_manual_override':'card.id_manual'),(int)$c['id']);
        $cards = rows('SELECT * FROM cards WHERE booklet_id=? ORDER BY page', [$c['booklet']]);
        $pending = count(array_filter($cards, fn($p) => !$p['scanned_at']));
        audit('card.scanned', (int) $c['id']);
        if ($pending)
            return ['complete' => false, 'booklet_id'=>(int)$c['booklet'], 'template_id'=>$templateId, 'scanned_page'=>(int)$c['page'], 'pending' => $pending, 'message' => 'Página salva para este estudante. Faltam ' . $pending . ' página(s) deste conjunto.'];
        $marks = [];
        foreach ($cards as $page)
            $marks = array_merge($marks, marks_from_scores(json_decode($page['scores'], true), (int) $e['alternatives']));
        $marks = canonical_version_marks($examId,(int)$c['booklet'],$marks);
        $qs = rows('SELECT * FROM questions WHERE exam_id=? ORDER BY number', [$examId]);
        $r = calculate_result($qs, $marks,$e['annulment_mode']);
        $grade=grade_breakdown($e,$qs,$r['responses'])['total'];
        query('INSERT INTO results(exam_id,student_id,booklet_id,correct,valid,annulled,percentage,credited,grade) VALUES(?,?,?,?,?,?,?,?,?)', [$examId, $studentId, $c['booklet'], $r['correct'], $r['valid'], $r['annulled'], $r['percentage'],$r['credited'],$grade]);
        $rid = (int) db()->lastInsertId();
        foreach ($r['responses'] as $a)
            query('INSERT INTO responses(result_id,question_id,marked,status) VALUES(?,?,?,?)', [$rid, $a['question_id'], $a['marked'], $a['status']]);
        return ['complete'=>true,'booklet_id'=>(int)$c['booklet'],'template_id'=>$templateId,'scanned_page'=>(int)$c['page'],'result_id'=>$rid,'correct'=>$r['correct'],'valid'=>$r['valid'],'annulled'=>$r['annulled'],'credited'=>$r['credited'],'incorrect'=>$r['incorrect'],'grade'=>$grade,'percentage'=>$r['percentage'],'message'=>'Resultado corrigido e salvo.'];
    });
}
