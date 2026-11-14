<?php
declare(strict_types=1);

function question_text(mixed $value, int $max=20000): string {
    $s=strval_trim($value);
    if($s===''||!mb_check_encoding($s,'UTF-8')||mb_strlen($s)>$max||preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u',$s))fail('Texto obrigatório ausente, muito longo ou inválido.');
    return $s;
}
function bank_question(int $id): array {
    $u=require_user();$q=one('SELECT * FROM question_bank WHERE id=? AND school_id=?',[$id,$u['school_id']]);
    if(!$q)fail('Questão não encontrada.',404);
    $q['options']=json_decode($q['options'],true,512,JSON_THROW_ON_ERROR);return $q;
}
function bank_where(array $filters): array {
    $u=require_user();$sql='school_id=? AND archived=0';$args=[$u['school_id']];
    foreach(['discipline','area','subject','difficulty'] as $key)if(strval_trim($filters[$key]??'')!==''){$sql.=' AND '.$key.'=?';$args[]=text_field($filters[$key]);}
    if(strval_trim($filters['search']??'')!==''){
        db()->sqliteCreateFunction('bank_lower',fn($s)=>mb_strtolower($s,'UTF-8'),1);
        $term=mb_strtolower(text_field($filters['search'],180),'UTF-8');$sql.=" AND (bank_lower(statement) LIKE ? ESCAPE '\\' OR bank_lower(subject) LIKE ? ESCAPE '\\' OR bank_lower(discipline) LIKE ? ESCAPE '\\')";
        $like='%'.str_replace(['\\','%','_'],['\\\\','\\%','\\_'],$term).'%';array_push($args,$like,$like,$like);
    }
    if(isset($filters['alternatives'])&&$filters['alternatives']!==''){$sql.=' AND json_array_length(options)=CAST(? AS INTEGER)';$args[]=(int)$filters['alternatives'];}
    return [$sql,$args];
}
function bank_list(array $filters): array {
    [$sql,$args]=bank_where($filters);$page=max(1,(int)($filters['page']??1));$limit=40;
    $items=rows('SELECT * FROM question_bank WHERE '.$sql.' ORDER BY id DESC LIMIT '.$limit.' OFFSET '.(($page-1)*$limit),$args);
    foreach($items as &$q)$q['options']=json_decode($q['options'],true);unset($q);
    $u=require_user();$facets=rows('SELECT DISTINCT discipline,area,subject,difficulty FROM question_bank WHERE school_id=? AND archived=0 ORDER BY discipline,area,subject',[$u['school_id']]);
    return ['items'=>$items,'total'=>(int)one('SELECT COUNT(*) n FROM question_bank WHERE '.$sql,$args)['n'],'page'=>$page,'facets'=>$facets];
}
function bank_save(array $body): array {
    return transaction(function()use($body){
        $u=require_user();$id=(int)($body['id']??0);$old=$id?bank_question($id):null;
        if($old&&(int)($body['revision']??0)!==(int)$old['revision'])fail('A questão foi alterada. Reabra antes de salvar.',409);
        $statement=question_text($body['statement']??'');$options=$body['options']??null;
        if(!is_array($options)||!array_is_list($options)||count($options)<2||count($options)>5)fail('Cadastre entre 2 e 5 alternativas.');
        $options=array_map(fn($s)=>question_text($s,5000),$options);
        $answer=$body['answer']??'';if(!is_string($answer)||strlen($answer)!==1||$answer<'A'||$answer>chr(64+count($options)))fail('Escolha a alternativa correta.');
        $difficulty=$body['difficulty']??'';if(!in_array($difficulty,['easy','medium','hard'],true))fail('Dificuldade inválida.');
        $imageId=array_key_exists('image_id',$body)?$body['image_id']:($old['image_id']??null);
        if($imageId!==null){if(!is_string($imageId))fail('Imagem inválida.');question_image($imageId);}
        $values=[$statement,json_encode($options,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$answer,text_field($body['discipline']??''),text_field($body['area']??''),text_field($body['subject']??''),$difficulty,$imageId];
        if($old){query('UPDATE question_bank SET statement=?,options=?,answer=?,discipline=?,area=?,subject=?,difficulty=?,image_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',array_merge($values,[$id]));}
        else {query('INSERT INTO question_bank(statement,options,answer,discipline,area,subject,difficulty,image_id,school_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',array_merge($values,[$u['school_id'],$u['id']]));$id=(int)db()->lastInsertId();}
        audit($old?'bank.updated':'bank.created',$id);return bank_question($id);
    });
}
function pinned_shuffle(array $items, array $fixed): array {
    $free=[];foreach($items as $i=>$item)if(!in_array($i,$fixed,true))$free[]=$item;
    for($i=count($free)-1;$i>0;$i--){$j=random_int(0,$i);[$free[$i],$free[$j]]=[$free[$j],$free[$i]];}
    $next=0;foreach($items as $i=>&$item)if(!in_array($i,$fixed,true))$item=$free[$next++];unset($item);return $items;
}
function version_plan(array $questions): array {
    $pins=[];foreach($questions as $i=>$q)if($q['fixed_position'])$pins[]=$i;
    $ordered=pinned_shuffle($questions,$pins);$out=[];
    foreach($ordered as $q){$order=pinned_shuffle(range(0,count($q['options'])-1),$q['fixed_options']);$out[]=['index'=>$q['index'],'choice_order'=>$order];}
    return $out;
}
function distinct_version_plan(array $questions,array $previous): array {
    // Comparação inclui as duas permutações. Restrições que impossibilitam
    // outra versão geram erro em vez de imprimir versões idênticas com letras diferentes.
    $seen=array_fill_keys(array_map(fn($p)=>json_encode($p,JSON_THROW_ON_ERROR),$previous),true);
    for($try=0;$try<512;$try++){$plan=version_plan($questions);if(!isset($seen[json_encode($plan,JSON_THROW_ON_ERROR)]))return $plan;}
    fail('As posições fixas não permitem gerar mais versões distintas. Reduza a quantidade de versões ou libere posições fixas.');
}
function prepare_bank_exam(array $body): array {
    $u=require_user();$name=text_field($body['name']??'');$date=(string)($body['date']??'');$d=DateTimeImmutable::createFromFormat('!Y-m-d',$date);
    if(!$d||$d->format('Y-m-d')!==$date)fail('Data inválida.');
    $duration=filter_var($body['duration']??null,FILTER_VALIDATE_INT);if($duration===false||$duration<1||$duration>1440)fail('Duração deve ser de 1 a 1440 minutos.');
    $pdfSettings=pdf_settings($body);
    $cids=$body['class_ids']??null;if(!is_array($cids)||!$cids)fail('Selecione as turmas.');$cids=array_values(array_unique(array_map('intval',$cids)));
    foreach($cids as $cid)if(!one('SELECT id FROM classes WHERE id=? AND school_id=?',[$cid,$u['school_id']]))fail('Turma fora da escola.');
    $count=filter_var($body['question_count']??null,FILTER_VALIDATE_INT);if($count===false||$count<1||$count>240)fail('Escolha de 1 a 240 questões.');
    $alt=(int)($body['alternatives']??5);if($alt<2||$alt>5)fail('Escolha entre 2 e 5 alternativas.');
    $selected=$body['selected']??[];
    if(($body['mode']??'manual')==='automatic'){
        $filters=$body['filters']??[];if(!is_array($filters))fail('Filtros inválidos.');$filters['alternatives']=$alt;[$where,$args]=bank_where($filters);
        $selected=array_map(fn($q)=>['id'=>$q['id']],rows('SELECT id FROM question_bank WHERE '.$where.' ORDER BY random() LIMIT '.$count,$args));
    }elseif(($body['mode']??'manual')!=='manual')fail('Modo de seleção inválido.');
    if(!is_array($selected)||!array_is_list($selected)||count($selected)!==$count)fail('A seleção deve conter exatamente '.$count.' questões. Confira os filtros e a quantidade disponível.');
    $qs=[];$seen=[];
    foreach($selected as $index=>$item){
        if(!is_array($item))fail('Seleção inválida.');$q=bank_question((int)($item['id']??0));
        if($q['archived']||isset($seen[$q['id']])||count($q['options'])!==$alt)fail('Questões repetidas, arquivadas ou com número diferente de alternativas.');$seen[$q['id']]=true;
        $pins=$item['fixed_options']??[];if(!is_array($pins))fail('Posições fixas inválidas.');
        foreach($pins as $pin)if(!is_int($pin)||$pin<0||$pin>=$alt)fail('Posição de alternativa fixa inválida.');
        $q['fixed_position']=!empty($item['fixed_position']);$q['fixed_options']=array_values(array_unique($pins));$q['index']=$index;$qs[]=$q;
    }
    $groups=array_unique(array_map(fn($q)=>$q['discipline'].' · '.$q['area'],$qs));if(count($groups)>30)fail('Limite de 30 combinações de disciplina e área.');
    $versions=(int)($body['versions']??3);if($versions<1||$versions>26)fail('Escolha entre 1 e 26 versões.');
    $plans=[];for($i=0;$i<$versions;$i++)$plans[chr(65+$i)]=distinct_version_plan($qs,array_values($plans));
    $draft=['name'=>$name,'date'=>$date,'duration'=>$duration]+$pdfSettings+['class_ids'=>$cids,'alternatives'=>$alt,'questions'=>$qs,'versions'=>$plans];
    $nonce=bin2hex(random_bytes(24));$_SESSION['bank_exam_preview']=['nonce'=>$nonce,'school_id'=>$u['school_id'],'user_id'=>$u['id'],'expires'=>time()+7200,'draft'=>$draft];
    return ['nonce'=>$nonce,'draft'=>$draft];
}
function persist_version(int $examId,string $label,array $plan,array $questionIds): int {
    query('INSERT INTO exam_versions(exam_id,label) VALUES(?,?)',[$examId,$label]);$vid=(int)db()->lastInsertId();
    foreach($plan as $i=>$item)query('INSERT INTO version_questions(version_id,position,question_id,choice_order) VALUES(?,?,?,?)',[$vid,$i+1,$questionIds[$item['index']],json_encode($item['choice_order'])]);
    query('INSERT INTO booklets(exam_id,reusable,version_id) VALUES(?,1,?)',[$examId,$vid]);$bid=(int)db()->lastInsertId();$total=count($plan);
    for($start=1,$page=1;$start<=$total;$start+=60,$page++)query('INSERT INTO cards(booklet_id,token,page,start_number,question_count) VALUES(?,?,?,?,?)',[$bid,bin2hex(random_bytes(16)),$page,$start,min(60,$total-$start+1)]);
    return $vid;
}
function finalize_bank_exam(array $body): array {
    $u=require_user();$p=$_SESSION['bank_exam_preview']??null;
    if(!$p||$p['school_id']!==$u['school_id']||$p['user_id']!==$u['id']||$p['expires']<time()||!hash_equals($p['nonce'],strval_trim($body['nonce']??'')))fail('Confira novamente a prévia antes de finalizar.',409);
    $result=transaction(function()use($p,$u){
        $d=$p['draft'];$cids=$d['class_ids'];$marks=implode(',',array_fill(0,count($cids),'?'));
        $classes=rows('SELECT id FROM classes WHERE school_id=? AND id IN ('.$marks.')',array_merge([$u['school_id']],$cids));if(count($classes)!==count($cids))fail('Turmas alteradas. Refaça a prévia.');
        $students=rows('SELECT id,class_id FROM students WHERE school_id=? AND class_id IN ('.$marks.')',array_merge([$u['school_id']],$cids));if(!$students)fail('Importe estudantes nas turmas selecionadas.');
        query('INSERT INTO exams(school_id,class_id,name,date,alternatives,created_by,duration,pdf_columns,pdf_group_images,cover_id) VALUES(?,?,?,?,?,?,?,?,?,?)',[$u['school_id'],$cids[0],$d['name'],$d['date'],$d['alternatives'],$u['id'],$d['duration'],$d['pdf_columns']??1,$d['pdf_group_images']??1,$d['cover_id']??null]);$eid=(int)db()->lastInsertId();
        $areas=[];$ids=[];
        foreach($d['questions'] as $i=>$q){
            $key=$q['discipline'].' · '.$q['area'];if(!isset($areas[$key])){query('INSERT INTO areas(exam_id,name,position) VALUES(?,?,?)',[$eid,$key,count($areas)]);$areas[$key]=(int)db()->lastInsertId();}
            query('INSERT INTO questions(exam_id,area_id,number,answer,discipline) VALUES(?,?,?,?,?)',[$eid,$areas[$key],$i+1,$q['answer'],$q['discipline']]);$qid=(int)db()->lastInsertId();$ids[]=$qid;
            query('INSERT INTO question_snapshots(question_id,source_id,source_revision,statement,options,area,subject,difficulty,fixed_position,fixed_options,image_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[$qid,$q['id'],$q['revision'],$q['statement'],json_encode($q['options'],JSON_UNESCAPED_UNICODE),$q['area'],$q['subject'],$q['difficulty'],$q['fixed_position']?1:0,json_encode($q['fixed_options']),$q['image_id']??null]);
        }
        foreach($cids as $cid)query('INSERT INTO exam_classes(exam_id,class_id) VALUES(?,?)',[$eid,$cid]);
        foreach($students as $s)query('INSERT INTO enrollments(exam_id,student_id,class_id) VALUES(?,?,?)',[$eid,$s['id'],$s['class_id']]);
        foreach($d['versions'] as $label=>$plan)persist_version($eid,$label,$plan,$ids);
        audit('exam.bank_created',$eid);return ['id'=>$eid];
    });unset($_SESSION['bank_exam_preview']);return $result;
}
function exam_versions(int $examId): array {
    return rows('SELECT v.*,b.id booklet_id FROM exam_versions v JOIN booklets b ON b.version_id=v.id AND b.reusable=1 AND b.template_id IS NULL WHERE v.exam_id=? ORDER BY v.label',[$examId]);
}
function version_content(int $examId,int $versionId): array {
    exam($examId);$v=one('SELECT * FROM exam_versions WHERE id=? AND exam_id=?',[$versionId,$examId]);if(!$v)fail('Versão não encontrada.',404);
    $qs=rows('SELECT vq.position,vq.choice_order,q.id,q.number original_number,q.answer,q.annulled,q.discipline,s.statement,s.options,s.area,s.subject,s.image_id FROM version_questions vq JOIN questions q ON q.id=vq.question_id JOIN question_snapshots s ON s.question_id=q.id WHERE vq.version_id=? ORDER BY vq.position',[$versionId]);
    foreach($qs as &$q){$order=json_decode($q['choice_order'],true);$options=json_decode($q['options'],true);$q['options']=array_map(fn($i)=>$options[$i],$order);$q['answer']=chr(65+array_search(ord($q['answer'])-65,$order,true));$q['choice_order']=$order;}unset($q);
    return $v+['questions'=>$qs];
}
function add_exam_versions(int $examId,int $count): array {
    return transaction(function()use($examId,$count){
        exam($examId);$existing=exam_versions($examId);if(!$existing)fail('Este simulado usa o fluxo anterior de cartões.');if($count<1||count($existing)+$count>26)fail('Limite de 26 versões.');
        $qs=rows('SELECT q.*,s.options,s.fixed_position,s.fixed_options FROM questions q JOIN question_snapshots s ON s.question_id=q.id WHERE q.exam_id=? ORDER BY q.number',[$examId]);
        foreach($qs as $i=>&$q){$q['index']=$i;$q['options']=json_decode($q['options'],true);$q['fixed_options']=json_decode($q['fixed_options'],true);}unset($q);
        $ids=array_column($qs,'id');$previous=[];
        foreach($existing as $v){$plan=[];foreach(rows('SELECT question_id,choice_order FROM version_questions WHERE version_id=? ORDER BY position',[$v['id']]) as $row)$plan[]=['index'=>array_search($row['question_id'],$ids,true),'choice_order'=>json_decode($row['choice_order'],true)];$previous[]=$plan;}
        for($i=count($existing);$i<count($existing)+$count;$i++){$plan=distinct_version_plan($qs,$previous);persist_version($examId,chr(65+$i),$plan,$ids);$previous[]=$plan;}
        audit('exam.versions_added',$examId);return ['versions'=>exam_versions($examId)];
    });
}
// OMR lê posições impressas. As respostas persistidas usam identidade e letras
// canônicas, permitindo relatórios comparáveis e recálculo sem perder a leitura.
function canonical_version_marks(int $examId,int $bookletId,array $marks): array {
    $b=one('SELECT version_id FROM booklets WHERE id=? AND exam_id=?',[$bookletId,$examId]);if(!$b)fail('Conjunto inválido.',409);if(!$b['version_id'])return $marks;
    $qs=rows('SELECT vq.position,vq.choice_order,q.number FROM version_questions vq JOIN questions q ON q.id=vq.question_id WHERE vq.version_id=? AND q.exam_id=? ORDER BY vq.position',[$b['version_id'],$examId]);
    if(count($qs)!==count($marks))fail('Mapeamento da versão incompleto.',409);$out=array_fill(0,count($marks),[]);
    foreach($qs as $i=>$q){$order=json_decode($q['choice_order'],true);$out[$q['number']-1]=array_map(fn($letter)=>chr(65+$order[ord($letter)-65]),$marks[$i]);}
    return $out;
}
