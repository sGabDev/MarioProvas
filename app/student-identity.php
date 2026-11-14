<?php
declare(strict_types=1);

function normalized_student_id(string $value): ?string {
    $value=trim($value);return preg_match('/^[0-9]{1,6}$/D',$value)?str_pad($value,6,'0',STR_PAD_LEFT):null;
}
function decode_student_identity(?array $scores): array {
    if($scores===null)return ['status'=>'unreadable','value'=>null];
    if(!array_is_list($scores)||count($scores)!==6)fail('Leitura da matrícula inválida.');
    $digits=[];$blank=0;$multiple=false;$ambiguous=false;
    foreach($scores as $row){
        if(!is_array($row)||!array_is_list($row)||count($row)!==10)fail('Leitura da matrícula incompleta.');$marks=[];
        foreach($row as $i=>$score){
            if(!is_numeric($score)||!is_finite((float)$score)||$score<0||$score>1)fail('Medição da matrícula inválida.');
            if($score>.20&&$score<.44)$ambiguous=true;
            if($score>=.44)$marks[]=(string)$i;
        }
        if(!$marks)$blank++;if(count($marks)>1)$multiple=true;$digits[]=$marks[0]??'';
    }
    $status=$ambiguous?'ambiguous':($multiple?'multiple':($blank===6?'blank':($blank?'incomplete':'recognized')));
    return ['status'=>$status,'value'=>$status==='recognized'?implode('',$digits):null];
}
function validate_student_identity(int $examId,int $studentId,?array $identity): array {
    if($identity===null)return ['scores'=>null,'value'=>null,'status'=>'legacy','method'=>'legacy'];
    $method=$identity['method']??'';if(!in_array($method,['manual','confirmed'],true))fail('Confirme o aluno identificado ou escolha um aluno manualmente.');
    $scores=$identity['scores']??null;if($scores!==null&&!is_array($scores))fail('Leitura da matrícula inválida.');
    $decoded=decode_student_identity($scores);
    if($method==='confirmed'){
        if($decoded['status']!=='recognized')fail('A matrícula não foi identificada. Selecione o aluno manualmente.',409);
        $matches=array_values(array_filter(rows('SELECT s.id,s.external_id FROM enrollments en JOIN students s ON s.id=en.student_id WHERE en.exam_id=?',[$examId]),fn($s)=>normalized_student_id($s['external_id'])===$decoded['value']));
        if(count($matches)!==1||(int)$matches[0]['id']!==$studentId)fail('A matrícula não corresponde a um único aluno selecionado. Confira e faça a seleção manual.',409);
    }
    return $decoded+['scores'=>$scores,'method'=>$method];
}
