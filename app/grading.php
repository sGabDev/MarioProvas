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
function calculate_result(array $questions, array $marks): array
{
    if (count($questions) !== count($marks))
        fail('Cartão incompleto.');
    $correct = 0;
    $valid = 0;
    $annulled = 0;
    $responses = [];
    foreach ($questions as $i => $q) {
        $m = $marks[$i];
        if (count($m) !== 1) {
            $status = count($m) === 0 ? 'blank' : 'multiple';
            $annulled++;
        } else {
            $valid++;
            $status = $m[0] === $q['answer'] ? 'correct' : 'incorrect';
            if ($status === 'correct')
                $correct++;
        }
        $responses[] = ['question_id' => $q['id'], 'marked' => implode(',', $m), 'status' => $status];
    }
    return ['correct' => $correct, 'valid' => $valid, 'annulled' => $annulled, 'percentage' => $valid ? round(100 * $correct / $valid, 2) : null, 'responses' => $responses];
}
function identify_card(string $token, int $examId): array
{
    $e = exam($examId);
    $u = require_user();
    $c = one('SELECT c.*,b.exam_id,b.student_id,b.id booklet,e.school_id FROM cards c JOIN booklets b ON b.id=c.booklet_id JOIN exams e ON e.id=b.exam_id WHERE c.token=? AND e.school_id=?', [$token, $u['school_id']]);
    if (!$c)
        fail('QR desconhecido. O cartão não foi identificado.', 404);
    if ((int) $c['exam_id'] !== $examId)
        fail('Este cartão pertence a outro simulado.', 409);
    if ($c['scanned_at'])
        fail('Cartão já processado. Nenhum resultado foi duplicado.', 409);
    return $c;
}
function save_scan(int $examId, string $token, int $studentId, array $scores, array $quality): array
{
    return transaction(function () use ($examId, $token, $studentId, $scores, $quality) {
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
        if ($c['student_id'] && (int) $c['student_id'] !== $studentId)
            fail('As páginas deste conjunto já foram vinculadas a outro estudante.', 409);
        if (one('SELECT id FROM booklets WHERE exam_id=? AND student_id=? AND id<>?', [$examId, $studentId, $c['booklet']]))
            fail('Estudante já vinculado a outro conjunto. Use as páginas desse conjunto.', 409);
        query('UPDATE booklets SET student_id=? WHERE id=?', [$studentId, $c['booklet']]);
        query('UPDATE cards SET scores=?,scanned_at=CURRENT_TIMESTAMP,scanned_by=? WHERE id=?', [json_encode($scores), $u['id'], $c['id']]);
        $cards = rows('SELECT * FROM cards WHERE booklet_id=? ORDER BY page', [$c['booklet']]);
        $pending = count(array_filter($cards, fn($p) => !$p['scanned_at']));
        audit('card.scanned', (int) $c['id']);
        if ($pending)
            return ['complete' => false, 'pending' => $pending, 'message' => 'Página salva. Faltam ' . $pending . ' página(s) deste conjunto.'];
        $marks = [];
        foreach ($cards as $page)
            $marks = array_merge($marks, marks_from_scores(json_decode($page['scores'], true), (int) $e['alternatives']));
        $qs = rows('SELECT * FROM questions WHERE exam_id=? ORDER BY number', [$examId]);
        $r = calculate_result($qs, $marks);
        query('INSERT INTO results(exam_id,student_id,booklet_id,correct,valid,annulled,percentage) VALUES(?,?,?,?,?,?,?)', [$examId, $studentId, $c['booklet'], $r['correct'], $r['valid'], $r['annulled'], $r['percentage']]);
        $rid = (int) db()->lastInsertId();
        foreach ($r['responses'] as $a)
            query('INSERT INTO responses(result_id,question_id,marked,status) VALUES(?,?,?,?)', [$rid, $a['question_id'], $a['marked'], $a['status']]);
        return ['complete' => true, 'result_id' => $rid, 'correct' => $r['correct'], 'valid' => $r['valid'], 'annulled' => $r['annulled'], 'percentage' => $r['percentage'], 'message' => 'Resultado corrigido e salvo.'];
    });
}
