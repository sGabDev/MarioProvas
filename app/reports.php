<?php
declare(strict_types=1);
function report(int $id): array {
    $e=exam($id);
    $students=rows('SELECT r.*,s.name,s.social_name,s.external_id,en.class_id,c.name class_name FROM results r JOIN students s ON s.id=r.student_id JOIN enrollments en ON en.exam_id=r.exam_id AND en.student_id=r.student_id JOIN classes c ON c.id=en.class_id WHERE r.exam_id=? ORDER BY c.name,s.name',[$id]);
    $areas=rows("SELECT a.id,a.name,COUNT(*) responses,SUM(rp.status='correct') correct,SUM(rp.status IN ('correct','incorrect')) valid,SUM(rp.status IN ('blank','multiple')) annulled FROM areas a JOIN questions q ON q.area_id=a.id JOIN responses rp ON rp.question_id=q.id JOIN results r ON r.id=rp.result_id WHERE a.exam_id=? GROUP BY a.id ORDER BY a.position",[$id]);
    $questions=rows("SELECT q.id,q.number,q.answer,a.name area,COUNT(rp.result_id) total,COALESCE(SUM(rp.status='correct'),0) correct,COALESCE(SUM(rp.status='incorrect'),0) incorrect,COALESCE(SUM(rp.status='blank'),0) blank,COALESCE(SUM(rp.status='multiple'),0) multiple FROM questions q JOIN areas a ON a.id=q.area_id LEFT JOIN responses rp ON rp.question_id=q.id WHERE q.exam_id=? GROUP BY q.id ORDER BY q.number",[$id]);
    $individualAreas=rows("SELECT r.student_id,a.id area_id,a.name,COUNT(*) total,SUM(rp.status='correct') correct,SUM(rp.status IN ('correct','incorrect')) valid,SUM(rp.status IN ('blank','multiple')) annulled FROM results r JOIN responses rp ON rp.result_id=r.id JOIN questions q ON q.id=rp.question_id JOIN areas a ON a.id=q.area_id WHERE r.exam_id=? GROUP BY r.student_id,a.id ORDER BY a.position",[$id]);
    foreach($areas as &$a){$percentages=[];foreach($individualAreas as $ia)if($ia['area_id']===$a['id'] && $ia['valid']>0)$percentages[]=100*$ia['correct']/$ia['valid'];$a['mean_percentage']=$percentages?array_sum($percentages)/count($percentages):null;$a['mean_correct']=count($students)?$a['correct']/count($students):null;}unset($a);
    $history=rows('SELECT e.id,e.name,e.date,r.student_id,r.correct,r.valid,r.annulled,r.percentage FROM results r JOIN exams e ON e.id=r.exam_id JOIN enrollments en ON en.student_id=r.student_id AND en.exam_id=? WHERE e.school_id=? ORDER BY e.date,e.id',[$id,$e['school_id']]);
    $comparison=rows('SELECT e.id,e.name,e.date,COUNT(r.id) total,AVG(r.percentage) mean_percentage,AVG(r.correct) mean_correct FROM exams e LEFT JOIN results r ON r.exam_id=e.id WHERE e.school_id=? AND EXISTS(SELECT 1 FROM exam_classes ec JOIN exam_classes target ON target.class_id=ec.class_id WHERE ec.exam_id=e.id AND target.exam_id=?) GROUP BY e.id ORDER BY e.date,e.id',[$e['school_id'],$id]);
    $validPercentages=array_column(array_filter($students,fn($s)=>$s['percentage']!==null),'percentage');
    $distribution=[0,0,0,0,0];$withoutValid=0;foreach($students as $s){if($s['percentage']===null){$withoutValid++;continue;}$distribution[min(4,(int)floor($s['percentage']/20))]++;}
    $pending=rows('SELECT b.id,b.student_id,b.template_id,s.name,s.social_name,COUNT(c.id) pages,SUM(c.scanned_at IS NOT NULL) scanned FROM booklets b JOIN cards c ON c.booklet_id=b.id LEFT JOIN students s ON s.id=b.student_id WHERE b.exam_id=? AND b.reusable=0 GROUP BY b.id HAVING scanned<pages',[$id]);
    $classStats=[];foreach($e['classes'] as $class){$ss=array_values(array_filter($students,fn($s)=>$s['class_id']===$class['id']));$ps=array_column(array_filter($ss,fn($s)=>$s['percentage']!==null),'percentage');$classStats[]=['id'=>$class['id'],'name'=>$class['name'],'total'=>count($ss),'mean_correct'=>$ss?array_sum(array_column($ss,'correct'))/count($ss):null,'mean_percentage'=>$ps?array_sum($ps)/count($ps):null,'annulled'=>array_sum(array_column($ss,'annulled'))];}
    return ['exam'=>$e,'classes'=>$classStats,'students'=>$students,'areas'=>$areas,'questions'=>$questions,'student_areas'=>$individualAreas,'history'=>$history,'comparison'=>$comparison,'distribution'=>$distribution,'without_valid'=>$withoutValid,'pending'=>$pending,'mean_percentage'=>$validPercentages?array_sum($validPercentages)/count($validPercentages):null,'mean_correct'=>count($students)?array_sum(array_column($students,'correct'))/count($students):null];
}
function individual_report(int $resultId): array {
    $u=require_user();$r=one('SELECT r.*,e.name exam_name,s.name,s.social_name,s.external_id FROM results r JOIN exams e ON e.id=r.exam_id JOIN students s ON s.id=r.student_id WHERE r.id=? AND e.school_id=?',[$resultId,$u['school_id']]);
    if(!$r)fail('Resultado não encontrado.',404);
    $r['responses']=rows('SELECT rp.*,q.number,q.answer,a.name area FROM responses rp JOIN questions q ON q.id=rp.question_id JOIN areas a ON a.id=q.area_id WHERE rp.result_id=? ORDER BY q.number',[$resultId]);
    return $r;
}
function csv_cell(mixed $v): string { $s=(string)($v??''); return preg_match('/^[\s]*[=+@\-\t\r\n]/u',$s)?"'".$s:$s; }
function export_report(int $id): never {
    $r=report($id);header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="marioprovas-simulado-'.$id.'.csv"');
    $f=fopen('php://output','w');fwrite($f,"\xEF\xBB\xBF");
    fputcsv($f,['Simulado','Data','Turma','Identificador','Estudante','Área','Acertos','Erros','Válidas','Anuladas','Percentual (somente válidas)'],';','"','');
    foreach($r['students'] as $s){$aRows=array_values(array_filter($r['student_areas'],fn($a)=>$a['student_id']===$s['student_id']));$aRows[]=['name'=>'TOTAL','correct'=>$s['correct'],'valid'=>$s['valid'],'annulled'=>$s['annulled']];
        foreach($aRows as $a)fputcsv($f,array_map('csv_cell',[$r['exam']['name'],$r['exam']['date'],$s['class_name'],$s['external_id'],$s['social_name']?:$s['name'],$a['name'],$a['correct'],$a['valid']-$a['correct'],$a['valid'],$a['annulled'],$a['valid']?number_format(100*$a['correct']/$a['valid'],2,',',''):''] ),';','"','');
    }fclose($f);exit;
}
