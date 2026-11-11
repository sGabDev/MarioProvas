<?php
declare(strict_types=1);

function validate_grading_policy(mixed $policy, array $questions): ?array {
    if($policy===null)return null;
    if(!is_array($policy)||!in_array($policy['scope']??'', ['total','areas'],true))fail('Escolha nota geral ou soma das notas por área.');
    $areas=[];foreach($questions as $q)$areas[(int)$q['area_id']]=($areas[(int)$q['area_id']]??0)+1;
    $rules=$policy['rules']??null;
    if(!is_array($rules)||count($rules)!==($policy['scope']==='total'?1:count($areas)))fail('Configure todas as áreas ou uma regra geral.');
    $out=[];$seen=[];
    foreach($rules as $rule){
        if(!is_array($rule))fail('Regra de nota inválida.');
        $aid=$policy['scope']==='total'?0:(int)($rule['area_id']??0);
        if(isset($seen[$aid])||($policy['scope']==='areas'&&!isset($areas[$aid])))fail('Área inválida ou repetida na configuração de notas.');$seen[$aid]=true;
        $metric=$rule['metric']??'';if(!in_array($metric,['correct','percentage'],true))fail('Escolha acertos ou percentual para cada regra.');
        $limit=$metric==='percentage'?100:($aid?$areas[$aid]:count($questions));
        $bands=$rule['bands']??null;if(!is_array($bands)||!count($bands)||count($bands)>100)fail('Cadastre entre 1 e 100 faixas por regra.');
        $clean=[];
        foreach($bands as $band){
            if(!is_array($band))fail('Faixa inválida.');$values=[];
            foreach(['min','max','points'] as $key){$v=$band[$key]??null;if(!is_numeric($v)||!is_finite((float)$v))fail('Preencha todos os limites e pontos das faixas.');$values[$key]=(float)$v;}
            if($values['min']<0||$values['max']>$limit||$values['max']<$values['min']||$values['points']<0||$values['points']>100000||abs(round($values['points'],2)-$values['points'])>1e-8)fail('Faixas fora do limite ou pontos inválidos (até duas casas decimais).');
            if($metric==='correct'&&($values['min']!==floor($values['min'])||$values['max']!==floor($values['max'])))fail('Limites por acertos devem ser inteiros.');
            $clean[]=$values;
        }
        usort($clean,fn($a,$b)=>$a['min']<=>$b['min']?:$a['max']<=>$b['max']);
        $next=0.0;foreach($clean as $i=>$band){
            if(abs($band['min']-$next)>1e-8||($i>0&&$metric==='percentage'&&$band['max']<=$band['min']))fail('As faixas devem cobrir todo o intervalo sem lacunas nem sobreposição.');
            if($i>0&&$band['points']<$clean[$i-1]['points'])fail('A pontuação não pode diminuir quando o número de acertos aumenta.');
            $next=$band['max']+($metric==='correct'?1:0);
        }
        if(abs($clean[count($clean)-1]['max']-$limit)>1e-8)fail('A última faixa precisa chegar a '.$limit.($metric==='percentage'?'%.':' acertos.'));
        $out[]=['area_id'=>$aid?:null,'metric'=>$metric,'bands'=>$clean];
    }
    return ['scope'=>$policy['scope'],'rules'=>$out];
}

function grade_metrics(array $rule,array $a): ?float {
    $n=$a['valid']+$a['credited'];if($n<=0)return null;
    $value=$rule['metric']==='correct'?$a['correct']+$a['credited']:100*($a['correct']+$a['credited'])/$n;
    foreach($rule['bands'] as $band)if($value<=$band['max']+1e-9&&$value>=$band['min']-1e-9)return (float)$band['points'];
    return null;
}
function grade_breakdown(array $exam,array $questions,array $responses): array {
    $policy=$exam['grading_policy']??null;if(is_string($policy))$policy=json_decode($policy,true);
    $byId=[];$totals=['correct'=>0,'valid'=>0,'annulled'=>0,'credited'=>0];$areas=[];
    foreach($questions as $q){$byId[$q['id']]=$q;$areas[(int)$q['area_id']]=$totals+['area_id'=>(int)$q['area_id'],'grade'=>null];}
    foreach($responses as $r){
        $q=$byId[$r['question_id']];$aid=(int)$q['area_id'];
        foreach([0,$aid] as $target){
            if($target===0)$a=&$totals;else $a=&$areas[$target];
            if($r['status']==='annulled'){$a['annulled']++;if(($exam['annulment_mode']??'credit')==='credit')$a['credited']++;}
            else{$a['valid']++;if($r['status']==='correct')$a['correct']++;}
            unset($a);
        }
    }
    foreach($areas as &$a){$n=$a['valid']+$a['credited'];$a['percentage']=$n?100*($a['correct']+$a['credited'])/$n:null;}unset($a);
    if(!$policy)return ['total'=>null,'areas'=>array_values($areas),'maximum'=>null];
    $points=[];$maximum=0;
    foreach($policy['rules'] as $rule){
        $a=$policy['scope']==='areas'?$areas[$rule['area_id']]:$totals;
        $grade=grade_metrics($rule,$a);
        $points[]=$grade;$maximum+=max(array_column($rule['bands'],'points'));
        if($policy['scope']==='areas')$areas[$rule['area_id']]['grade']=$grade;
    }
    return ['total'=>in_array(null,$points,true)?null:round(array_sum($points),2),'areas'=>array_values($areas),'maximum'=>round($maximum,2)];
}

function regrade_exam(array $exam): int {
    $questions=rows('SELECT * FROM questions WHERE exam_id=? ORDER BY number',[$exam['id']]);$count=0;
    foreach(rows('SELECT * FROM results WHERE exam_id=?',[$exam['id']]) as $result){
        $stored=rows('SELECT rp.* FROM responses rp JOIN questions q ON q.id=rp.question_id WHERE rp.result_id=? ORDER BY q.number',[$result['id']]);
        $marks=array_map(fn($r)=>$r['marked']!==''&&$r['marked']!==null?explode(',',$r['marked']):[],$stored);
        $r=calculate_result($questions,$marks,$exam['annulment_mode']);$grade=grade_breakdown($exam,$questions,$r['responses'])['total'];
        query('UPDATE results SET correct=?,valid=?,annulled=?,percentage=?,credited=?,grade=? WHERE id=?',[$r['correct'],$r['valid'],$r['annulled'],$r['percentage'],$r['credited'],$grade,$result['id']]);
        foreach($r['responses'] as $a)query('UPDATE responses SET status=? WHERE result_id=? AND question_id=?',[$a['status'],$result['id'],$a['question_id']]);$count++;
    }
    return $count;
}

function update_assessment(int $id,array $body,bool $key): array {
    return transaction(function()use($id,$body,$key){
        $exam=exam($id);if((int)($body['revision']??0)!==(int)$exam['revision'])fail('O simulado foi alterado por outro usuário. Reabra a tela para conferir a versão atual.',409);
        $questions=rows('SELECT * FROM questions WHERE exam_id=? ORDER BY number',[$id]);
        $mode=$body['annulment_mode']??'credit';if($mode!=='credit')fail('Questões anuladas devem dar o ponto a todos os alunos.');
        if($key){
            $answers=$body['questions']??null;if(!is_array($answers)||count($answers)!==count($questions))fail('Envie o gabarito completo.');$map=[];
            foreach($answers as $a){if(!is_array($a))fail('Questão inválida.');$qid=(int)($a['id']??0);if(isset($map[$qid]))fail('Questão repetida.');$map[$qid]=$a;}
            foreach($questions as $q){$a=$map[$q['id']]??null;$answer=$a['answer']??'';
                if(!$a||!is_string($answer)||strlen($answer)!==1||$answer<'A'||$answer>chr(64+$exam['alternatives'])||!is_bool($a['annulled']??false))fail('Alternativa ou anulação inválida.');
                query('UPDATE questions SET answer=?,annulled=? WHERE id=?',[$answer,!empty($a['annulled'])?1:0,$q['id']]);
            }
        }else{
            $policy=validate_grading_policy($body['grading_policy']??null,$questions);
            query('UPDATE exams SET grading_policy=? WHERE id=?',[$policy?json_encode($policy,JSON_THROW_ON_ERROR):null,$id]);
        }
        query('UPDATE exams SET annulment_mode=?,revision=revision+1 WHERE id=?',[$mode,$id]);
        $exam=exam($id);$count=regrade_exam($exam);audit($key?'exam.key_updated':'exam.grading_updated',$id);
        return ['message'=>'Configuração salva. '.$count.' resultado(s) recalculado(s).','recalculated'=>$count,'revision'=>$exam['revision']];
    });
}
