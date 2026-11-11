<?php
declare(strict_types=1);
function parse_csv(string $content): array {
    if(strlen($content)>8*1024*1024) fail('CSV excede 8 MB.');
    if(str_contains($content,"\0")) fail('Arquivo não é um CSV de texto válido.');
    if(!mb_check_encoding($content,'UTF-8')) $content=mb_convert_encoding($content,'UTF-8','Windows-1252');
    $content=preg_replace('/^\xEF\xBB\xBF/','',$content);
    $first=strtok($content,"\r\n") ?: '';
    $delimiter=';';$max=0;
    foreach([';',',',"\t",'|'] as $d){$n=count(str_getcsv($first,$d,'"',''));if($n>$max){$max=$n;$delimiter=$d;}}
    $f=fopen('php://temp','r+'); fwrite($f,$content);rewind($f);
    $header=fgetcsv($f,0,$delimiter,'"',''); if(!$header || count($header)<2) fail('CSV sem cabeçalho válido.');
    $header=array_map('trim',$header); if(count(array_unique($header))!==count($header) || in_array('',$header,true)) fail('Cabeçalhos vazios ou repetidos. Renomeie as colunas em uma cópia do CSV.');
    $data=[];$line=1;
    while(($r=fgetcsv($f,0,$delimiter,'"',''))!==false){$line++;if(count($r)===1 && trim((string)$r[0])==='')continue; $data[]=['line'=>$line,'values'=>array_map(fn($x)=>trim((string)$x),$r)];if(count($data)>20000)fail('Limite: 20.000 registros por arquivo.');}
    fclose($f); if(!$data)fail('CSV sem registros.');
    $suggest=['external_id'=>'','name'=>'','social_name'=>'','class_name'=>'','grade_name'=>''];
    $patterns=['external_id'=>['id','matrícula','matricula','número de matrícula','aluno: inep'],'name'=>['aluno: nome','nome','nome do estudante'],'social_name'=>['aluno: nome social','nome social'],'class_name'=>['turma: nome','turma','classe'],'grade_name'=>['ano de escolaridade: nome','série','serie','ano de escolaridade','série/ano','ano escolar']];
    foreach($patterns as $key=>$names)foreach($names as $n)foreach($header as $i=>$h)if(mb_strtolower($h)===$n && $suggest[$key]==='')$suggest[$key]=(string)$i;
    return ['headers'=>$header,'rows'=>$data,'delimiter'=>$delimiter,'suggested'=>$suggest];
}
function preview_import(array $parsed,array $mapping,int $school): array {
    $used=[];foreach(['external_id','name','class_name','social_name','grade_name'] as $k){$v=$mapping[$k]??'';if($v==='' && in_array($k,['social_name','grade_name'],true))continue;if(!ctype_digit((string)$v) || !isset($parsed['headers'][(int)$v]) || in_array((int)$v,$used,true))fail('Relacione identificador, nome e turma a colunas diferentes.');$used[]=(int)$v;}
    $existing=[];$names=[];foreach(rows('SELECT s.*,c.name class_name FROM students s JOIN classes c ON c.id=s.class_id WHERE s.school_id=?',[$school]) as $s){$existing[$s['external_id']]=$s;$names[mb_strtolower($s['name'].'|'.$s['class_name'])]=$s['external_id'];}
    $ids=[];$fileNames=[];$out=[];$count=['ready'=>0,'invalid'=>0,'duplicate'=>0];$grades=[];
    if(($mapping['grade_name']??'')!=='')foreach($parsed['rows'] as $r){$cn=$r['values'][(int)$mapping['class_name']]??'';$gn=$r['values'][(int)$mapping['grade_name']]??'';if($gn!=='')$grades[$cn][$gn]=true;}
    $classGrades=[];foreach(rows('SELECT name,grade_name FROM classes WHERE school_id=?',[$school]) as $c)$classGrades[$c['name']]=$c['grade_name'];
    foreach($parsed['rows'] as $r){
        $s=['line'=>$r['line']];foreach(['external_id','name','class_name','social_name','grade_name'] as $key){$i=$mapping[$key]??'';$s[$key]=$i===''?'':($r['values'][(int)$i]??'');}
        $issues=[];$state='ready';
        if(count($r['values'])!==count($parsed['headers']))$issues[]='Quantidade de colunas diferente do cabeçalho';
        foreach(['external_id','name','class_name'] as $key)if($s[$key]==='' || mb_strlen($s[$key])>180 || preg_match('/[\x00-\x1F]/u',$s[$key]))$issues[]='Identificador, nome ou turma ausente/inválido';
        if(mb_strlen($s['social_name'])>180 || preg_match('/[\x00-\x1F]/u',$s['social_name']))$issues[]='Nome social inválido';
        if(mb_strlen($s['grade_name'])>180 || preg_match('/[\x00-\x1F]/u',$s['grade_name']))$issues[]='Série inválida';
        if(count($grades[$s['class_name']]??[])>1)$issues[]='A mesma turma aparece com séries diferentes no arquivo';
        if($s['grade_name']!=='' && ($classGrades[$s['class_name']]??'')!=='' && $classGrades[$s['class_name']]!==$s['grade_name'])$issues[]='Série difere do cadastro da turma; confira antes de importar';
        if($issues)$state='invalid';
        else {
            $id=$s['external_id'];$nk=mb_strtolower($s['name'].'|'.$s['class_name']);
            if(isset($ids[$id])){$state='duplicate';$issues[]='Identificador repetido no arquivo';}
            elseif(isset($existing[$id])){$state='duplicate';$e=$existing[$id];$issues[]=($e['name']===$s['name'] && $e['class_name']===$s['class_name'] && $e['social_name']===$s['social_name'])?'Já importado; será ignorado':'Identificador existente com dados diferentes; confira no cadastro';}
            elseif(isset($names[$nk]) || isset($fileNames[$nk])){$state='duplicate';$issues[]='Mesmo nome e turma com outro identificador; revisar possível duplicidade';}
            $ids[$id]=true;$fileNames[$nk]=$id;
        }
        $s['state']=$state;$s['issues']=$issues;$count[$state]++;$out[]=$s;
    }
    $gradeUpdates=[];
    foreach($out as $s)if($s['grade_name']!=='' && ($classGrades[$s['class_name']]??'')==='' && ($s['state']==='ready'||($s['state']==='duplicate' && $s['issues']===['Já importado; será ignorado'])))$gradeUpdates[$s['class_name']]=$s['grade_name'];
    return ['counts'=>$count,'rows'=>$out,'grade_updates'=>count($gradeUpdates)];
}
function commit_import(array $parsed,array $mapping,int $school): array {
    return transaction(function()use($parsed,$mapping,$school){
        $preview=preview_import($parsed,$mapping,$school);$n=0;$gradeUpdates=0;
        foreach($preview['rows'] as $r){
            if($r['grade_name']!=='' && ($r['state']==='ready'||($r['state']==='duplicate' && $r['issues']===['Já importado; será ignorado'])))$gradeUpdates+=query("UPDATE classes SET grade_name=? WHERE school_id=? AND name=? AND grade_name=''",[$r['grade_name'],$school,$r['class_name']])->rowCount();
            if($r['state']!=='ready')continue;
            query('INSERT OR IGNORE INTO classes(school_id,name,grade_name) VALUES(?,?,?)',[$school,$r['class_name'],$r['grade_name']]);
            $cid=one('SELECT id FROM classes WHERE school_id=? AND name=?',[$school,$r['class_name']])['id'];
            query('INSERT INTO students(school_id,external_id,name,social_name,class_id) VALUES(?,?,?,?,?)',[$school,$r['external_id'],$r['name'],$r['social_name'],$cid]);$n++;
        }
        return ['imported'=>$n,'skipped'=>$preview['counts']['invalid']+$preview['counts']['duplicate'],'grades_updated'=>$gradeUpdates];
    });
}
