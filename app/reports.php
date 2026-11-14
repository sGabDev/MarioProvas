<?php
declare(strict_types=1);
function report(int $id, int $classId=0, string $gradeName=''): array {
    $e=exam($id);$gradeName=trim($gradeName);$allClasses=$e['classes'];
    if($classId&&!in_array($classId,array_column($allClasses,'id'),true))fail('Turma fora deste simulado.',422);
    if($gradeName!==''&&!in_array($gradeName,array_column($allClasses,'grade_name'),true))fail('Série fora deste simulado.',422);
    $selected=array_values(array_filter($allClasses,fn($c)=>(!$classId||$c['id']===$classId)&&($gradeName===''||$c['grade_name']===$gradeName)));
    $ids=array_column($selected,'id');$in=implode(',',array_fill(0,max(1,count($ids)),'?'));$args=$ids?:[-1];
    $students=rows('SELECT r.*,s.name,s.social_name,s.external_id,en.class_id,c.name class_name,c.grade_name FROM results r JOIN students s ON s.id=r.student_id JOIN enrollments en ON en.exam_id=r.exam_id AND en.student_id=r.student_id JOIN classes c ON c.id=en.class_id WHERE r.exam_id=? AND en.class_id IN ('.$in.') ORDER BY c.name,s.name',array_merge([$id],$args));
    foreach($students as &$s){$s['incorrect']=$s['valid']-$s['correct'];$s['considered']=$s['valid']+$s['credited'];$s['version_label']=one('SELECT v.label FROM booklets b JOIN exam_versions v ON v.id=b.version_id WHERE b.id=?',[$s['booklet_id']])['label']??null;$s['blank']=(int)one("SELECT COUNT(*) n FROM responses WHERE result_id=? AND marked=''",[$s['id']])['n'];}unset($s);
    $resultIds=array_column($students,'id');$rin=implode(',',array_fill(0,max(1,count($resultIds)),'?'));$rargs=$resultIds?:[-1];
    $credit=$e['annulment_mode']==='credit'?1:0;
    $individualAreas=rows("SELECT r.student_id,a.id area_id,a.name,COUNT(*) total,SUM(rp.status='correct') correct,SUM(rp.status<>'annulled') valid,SUM(rp.status='annulled') annulled,$credit*SUM(rp.status='annulled') credited FROM results r JOIN responses rp ON rp.result_id=r.id JOIN questions q ON q.id=rp.question_id JOIN areas a ON a.id=q.area_id WHERE r.id IN ($rin) GROUP BY r.student_id,a.id ORDER BY a.position",$rargs);
    $rules=[];if(($e['grading_policy']['scope']??'')==='areas')foreach($e['grading_policy']['rules'] as $rule)$rules[$rule['area_id']]=$rule;
    foreach($individualAreas as &$a){$a['considered']=$a['valid']+$a['credited'];$a['percentage']=$a['considered']?100*($a['correct']+$a['credited'])/$a['considered']:null;$a['grade']=isset($rules[$a['area_id']])?grade_metrics($rules[$a['area_id']],$a):null;}unset($a);
    $areas=[];foreach(rows('SELECT * FROM areas WHERE exam_id=? ORDER BY position',[$id]) as $area){
        $ss=array_values(array_filter($individualAreas,fn($a)=>$a['area_id']===$area['id']));$ps=array_column(array_filter($ss,fn($a)=>$a['percentage']!==null),'percentage');$gs=array_column(array_filter($ss,fn($a)=>$a['grade']!==null),'grade');
        $areas[]=['id'=>$area['id'],'name'=>$area['name'],'correct'=>array_sum(array_column($ss,'correct')),'valid'=>array_sum(array_column($ss,'valid')),'annulled'=>array_sum(array_column($ss,'annulled')),'credited'=>array_sum(array_column($ss,'credited')),'mean_correct'=>$students?array_sum(array_column($ss,'correct'))/count($students):null,'mean_percentage'=>$ps?array_sum($ps)/count($ps):null,'mean_grade'=>$gs?array_sum($gs)/count($gs):null];
    }
    $questions=rows("SELECT q.id,q.number,q.answer,q.annulled,a.name area,COUNT(rp.result_id) total,COALESCE(SUM(rp.status='correct'),0) correct,COALESCE(SUM(rp.status IN ('incorrect','blank','multiple')),0) incorrect,COALESCE(SUM(rp.status='blank'),0) blank,COALESCE(SUM(rp.status='multiple'),0) multiple,COALESCE(SUM(rp.status='annulled'),0) annulled_responses FROM questions q JOIN areas a ON a.id=q.area_id LEFT JOIN responses rp ON rp.question_id=q.id AND rp.result_id IN ($rin) WHERE q.exam_id=? GROUP BY q.id ORDER BY q.number",array_merge($rargs,[$id]));
    $history=rows('SELECT e.id,e.name,e.date,r.student_id,r.correct,r.valid,r.annulled,r.credited,r.grade,r.percentage FROM results r JOIN exams e ON e.id=r.exam_id JOIN enrollments en ON en.student_id=r.student_id AND en.exam_id=? WHERE e.school_id=? AND en.class_id IN ('.$in.') ORDER BY e.date,e.id',array_merge([$id,$e['school_id']],$args));
    $comparison=rows('SELECT e.id,e.name,e.date,COUNT(r.id) total,AVG(r.percentage) mean_percentage,AVG(r.correct) mean_correct,AVG(r.grade) mean_grade FROM exams e LEFT JOIN results r ON r.exam_id=e.id AND r.student_id IN (SELECT en.student_id FROM enrollments en WHERE en.exam_id=e.id AND en.class_id IN ('.$in.')) WHERE e.school_id=? AND EXISTS(SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id IN ('.$in.')) GROUP BY e.id ORDER BY e.date,e.id',array_merge($args,[$e['school_id']],$args));
    $pending=rows('SELECT b.id,b.student_id,b.template_id,s.name,s.social_name,COUNT(c.id) pages,SUM(c.scanned_at IS NOT NULL) scanned FROM booklets b JOIN cards c ON c.booklet_id=b.id LEFT JOIN students s ON s.id=b.student_id LEFT JOIN enrollments en ON en.exam_id=b.exam_id AND en.student_id=b.student_id WHERE b.exam_id=? AND b.reusable=0 AND (en.class_id IN ('.$in.')'.(!$classId&&$gradeName===''?' OR b.student_id IS NULL':'').') GROUP BY b.id HAVING scanned<pages',array_merge([$id],$args));
    $ps=array_column(array_filter($students,fn($s)=>$s['percentage']!==null),'percentage');$gs=array_column(array_filter($students,fn($s)=>$s['grade']!==null),'grade');$distribution=[0,0,0,0,0];$withoutValid=0;
    foreach($students as $s){if($s['percentage']===null){$withoutValid++;continue;}$distribution[min(4,(int)floor($s['percentage']/20))]++;}
    $classes=[];foreach($selected as $class){$ss=array_values(array_filter($students,fn($s)=>$s['class_id']===$class['id']));$cp=array_column(array_filter($ss,fn($s)=>$s['percentage']!==null),'percentage');$classes[]=$class+['total'=>count($ss),'mean_correct'=>$ss?array_sum(array_column($ss,'correct'))/count($ss):null,'mean_percentage'=>$cp?array_sum($cp)/count($cp):null,'annulled'=>array_sum(array_column($ss,'annulled'))];}
    $disciplines=rows("SELECT q.discipline,COUNT(*) total,SUM(rp.status='correct') correct,SUM(rp.status IN ('incorrect','blank','multiple')) incorrect,SUM(rp.marked='') blank,SUM(rp.status='annulled') annulled FROM responses rp JOIN questions q ON q.id=rp.question_id WHERE rp.result_id IN ($rin) AND q.discipline<>'' GROUP BY q.discipline ORDER BY q.discipline",$rargs);
    return ['exam'=>$e,'filters'=>['class_id'=>$classId,'grade_name'=>$gradeName],'available_classes'=>$allClasses,'classes'=>$classes,'students'=>$students,'areas'=>$areas,'disciplines'=>$disciplines,'questions'=>$questions,'student_areas'=>$individualAreas,'history'=>$history,'comparison'=>$comparison,'distribution'=>$distribution,'without_valid'=>$withoutValid,'pending'=>$pending,'mean_percentage'=>$ps?array_sum($ps)/count($ps):null,'mean_correct'=>$students?array_sum(array_column($students,'correct'))/count($students):null,'mean_grade'=>$gs?array_sum($gs)/count($gs):null];
}
function individual_report(int $resultId): array {
    $u=require_user();$r=one('SELECT r.*,e.name exam_name,s.name,s.social_name,s.external_id FROM results r JOIN exams e ON e.id=r.exam_id JOIN students s ON s.id=r.student_id WHERE r.id=? AND e.school_id=?',[$resultId,$u['school_id']]);
    if(!$r)fail('Resultado não encontrado.',404);
    $exam=exam((int)$r['exam_id']);$r['annulment_mode']=$exam['annulment_mode'];$r['incorrect']=$r['valid']-$r['correct'];$r['considered']=$r['valid']+$r['credited'];
    $r['responses']=rows('SELECT rp.*,q.number,q.answer,q.area_id,q.annulled,a.name area FROM responses rp JOIN questions q ON q.id=rp.question_id JOIN areas a ON a.id=q.area_id WHERE rp.result_id=? ORDER BY q.number',[$resultId]);
    $grading=grade_breakdown($exam,rows('SELECT * FROM questions WHERE exam_id=?',[$r['exam_id']]),$r['responses']);$names=[];foreach($r['responses'] as $q)$names[$q['area_id']]=$q['area'];
    $r['areas']=array_map(fn($a)=>$a+['name'=>$names[$a['area_id']]],$grading['areas']);$r['maximum_grade']=$grading['maximum'];
    $r['blank']=count(array_filter($r['responses'],fn($q)=>$q['marked']===''));
    $b=one('SELECT version_id FROM booklets WHERE id=?',[$r['booklet_id']]);$r['version_label']=null;
    if($b['version_id']){
        $v=version_content((int)$r['exam_id'],(int)$b['version_id']);$r['version_label']=$v['label'];$byId=array_column($r['responses'],null,'question_id');$printed=[];
        foreach($v['questions'] as $q){$a=$byId[$q['id']];$order=$q['choice_order'];$a['original_number']=$a['number'];$a['number']=$q['position'];$a['answer']=$q['answer'];$a['marked']=$a['marked']!==''?implode(',',array_map(fn($letter)=>chr(65+array_search(ord($letter)-65,$order,true)),explode(',',$a['marked']))):'';$printed[]=$a;}$r['responses']=$printed;
    }
    return $r;
}
function csv_cell(mixed $v): string { $s=(string)($v??''); return preg_match('/^[\s]*[=+@\-\t\r\n]/u',$s)?"'".$s:$s; }
function export_report(int $id,int $classId=0,string $gradeName=''): never {
    $r=report($id,$classId,$gradeName);header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="marioprovas-simulado-'.$id.'.csv"');
    $f=fopen('php://output','w');fwrite($f,"\xEF\xBB\xBF");
    $versioned=(bool)exam_versions($id);
    fputcsv($f,array_merge(['Simulado','Data','Turma','Identificador','Estudante','Área','Acertos','Erros','Válidas','Anuladas pelo professor','Percentual','Créditos por anulação','Questões consideradas','Nota','Série'],$versioned?['Versão','Em branco (total do aluno)']:[]),';','"','');
    foreach($r['students'] as $s){$aRows=array_values(array_filter($r['student_areas'],fn($a)=>$a['student_id']===$s['student_id']));$aRows[]=['name'=>'TOTAL','correct'=>$s['correct'],'valid'=>$s['valid'],'annulled'=>$s['annulled'],'credited'=>$s['credited'],'grade'=>$s['grade']];
        foreach($aRows as $a){$n=$a['valid']+$a['credited'];fputcsv($f,array_map('csv_cell',array_merge([$r['exam']['name'],$r['exam']['date'],$s['class_name'],$s['external_id'],$s['social_name']?:$s['name'],$a['name'],$a['correct'],$a['valid']-$a['correct'],$a['valid'],$a['annulled'],$n?number_format(100*($a['correct']+$a['credited'])/$n,2,',',''):'',$a['credited'],$n,$a['grade']===null?'':number_format($a['grade'],2,',',''),$s['grade_name']],$versioned?[$s['version_label'],$s['blank']]:[])),';','"','');}
    }fclose($f);exit;
}
