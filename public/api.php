<?php
declare(strict_types=1);
require dirname(__DIR__).'/app/bootstrap.php';
require dirname(__DIR__).'/app/import.php';
require dirname(__DIR__).'/app/grading.php';
require dirname(__DIR__).'/app/reports.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');header('X-Content-Type-Options: nosniff');header('Referrer-Policy: same-origin');
start_session();
try {
    $action=$_GET['action']??'state';$method=$_SERVER['REQUEST_METHOD'];
    $write=['login','logout','setup','upload','preview','import','student_update','class_update','create_exam','generate_cards','scan','team_create'];
    if(in_array($action,$write,true)){
        if($method!=='POST')fail('Método não permitido.',405);
        if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))fail('Sessão expirada. Atualize a página.',403);
    }
    $body=[];if(str_contains($_SERVER['CONTENT_TYPE']??'','application/json')){if((int)($_SERVER['CONTENT_LENGTH']??0)>2*1024*1024)fail('Requisição muito grande.',413);$body=json_decode(file_get_contents('php://input'),true,512,JSON_THROW_ON_ERROR);if(!is_array($body))fail('Dados inválidos.');}
    if($action==='state') {
        $user=current_user();$out=['user'=>$user,'csrf'=>$_SESSION['csrf'],'installed'=>(bool)one('SELECT id FROM users LIMIT 1')];
    } elseif($action==='setup') {
        if(!$config['setup_key'] || strlen($config['setup_key'])<32 || !hash_equals($config['setup_key'],strval_trim($body['key']??'')))fail('Chave de instalação inválida. Consulte o README.',403);
        $out=transaction(function()use($body){if(one('SELECT id FROM users LIMIT 1'))fail('Instalação já concluída.',409);
            $name=text_field($body['name']??'');$school=text_field($body['school']??'');$email=mb_strtolower(text_field($body['email']??''));$pass=(string)($body['password']??'');if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($pass)<12||strlen($pass)>200)fail('E-mail válido e senha entre 12 e 200 caracteres são obrigatórios.');
            query('INSERT INTO schools(name) VALUES(?)',[$school]);$sid=(int)db()->lastInsertId();query('INSERT INTO users(school_id,name,email,password,role) VALUES(?,?,?,?,?)',[$sid,$name,$email,password_hash($pass,PASSWORD_DEFAULT),'admin']);return ['message'=>'Instalação concluída. Entre com sua conta.'];});
    } elseif($action==='login') {
        $email=mb_strtolower(strval_trim($body['email']??''));$key=hash('sha256',($_SERVER['REMOTE_ADDR']??'').'|'.$email);$attempt=one('SELECT * FROM login_attempts WHERE key=?',[$key]);
        if($attempt && time()-(int)$attempt['started']<900 && $attempt['attempts']>=8)fail('Muitas tentativas. Aguarde 15 minutos.',429);
        $user=one('SELECT * FROM users WHERE email=?',[$email]);$password=(string)($body['password']??'');
        if(!$user || !password_verify($password,$user['password'])){
            query('INSERT INTO login_attempts(key,attempts,started) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN started<? THEN 1 ELSE attempts+1 END,started=CASE WHEN started<? THEN excluded.started ELSE started END',[$key,time(),time()-900,time()-900]);fail('E-mail ou senha incorretos.',401);
        }
        query('DELETE FROM login_attempts WHERE key=?',[$key]);session_regenerate_id(true);$_SESSION['uid']=$user['id'];$_SESSION['csrf']=bin2hex(random_bytes(32));$out=['user'=>current_user(),'csrf'=>$_SESSION['csrf']];
    } else {
        $u=require_user();$school=(int)$u['school_id'];
        switch($action){
            case 'logout': $_SESSION=[];session_regenerate_id(true);$_SESSION['csrf']=bin2hex(random_bytes(32));$out=['csrf'=>$_SESSION['csrf']];break;
            case 'dashboard':
                $out=['school'=>one('SELECT name FROM schools WHERE id=?',[$school])['name'],'classes'=>rows('SELECT c.*,COUNT(s.id) students FROM classes c LEFT JOIN students s ON s.class_id=c.id WHERE c.school_id=? GROUP BY c.id ORDER BY c.name',[$school]),'exams'=>array_map('with_exam_classes',rows('SELECT e.*,(SELECT COUNT(*) FROM questions WHERE exam_id=e.id) questions,(SELECT COUNT(*) FROM enrollments WHERE exam_id=e.id) enrolled,(SELECT COUNT(*) FROM results WHERE exam_id=e.id) graded FROM exams e WHERE e.school_id=? ORDER BY e.date DESC,e.id DESC',[$school])),'student_count'=>(int)one('SELECT COUNT(*) n FROM students WHERE school_id=?',[$school])['n'],'result_count'=>(int)one('SELECT COUNT(*) n FROM results r JOIN exams e ON e.id=r.exam_id WHERE e.school_id=?',[$school])['n']];break;
            case 'class_update':
                $cid=(int)($body['id']??0);if(!one('SELECT id FROM classes WHERE id=? AND school_id=?',[$cid,$school]))fail('Turma não encontrada.',404);
                $grade=strval_trim($body['grade_name']??'');if(mb_strlen($grade)>180||preg_match('/[\x00-\x1F]/u',$grade))fail('Série inválida.');
                query('UPDATE classes SET grade_name=? WHERE id=?',[$grade,$cid]);audit('class.updated',$cid);$out=['message'=>'Série da turma atualizada.'];break;
            case 'students': $out=rows('SELECT s.*,c.name class_name FROM students s JOIN classes c ON c.id=s.class_id WHERE s.school_id=? ORDER BY c.name,s.name',[$school]);break;
            case 'student_update':
                $id=(int)($body['id']??0);if(!one('SELECT id FROM students WHERE id=? AND school_id=?',[$id,$school]))fail('Estudante não encontrado.',404);
                $cid=(int)($body['class_id']??0);if(!one('SELECT id FROM classes WHERE id=? AND school_id=?',[$cid,$school]))fail('Turma inválida.');
                $social=strval_trim($body['social_name']??'');if(mb_strlen($social)>180||preg_match('/[\x00-\x1F]/u',$social))fail('Nome social inválido.');
                query('UPDATE students SET name=?,social_name=?,class_id=? WHERE id=?',[text_field($body['name']??''),$social,$cid,$id]);audit('student.updated',$id);$out=['message'=>'Cadastro atualizado. A participação em simulados existentes foi preservada.'];break;
            case 'upload':
                if(!isset($_FILES['file'])||$_FILES['file']['error']!==UPLOAD_ERR_OK)fail('Envie um CSV de até 8 MB (confira também o limite de upload do PHP).');
                $parsed=parse_csv(file_get_contents($_FILES['file']['tmp_name']));$_SESSION['import']=$parsed;unset($_SESSION['import_preview']);$out=['headers'=>$parsed['headers'],'suggested'=>$parsed['suggested'],'rows'=>count($parsed['rows']),'delimiter'=>$parsed['delimiter']];break;
            case 'preview':
                if(empty($_SESSION['import']))fail('Envie o CSV novamente.');$mapping=$body['mapping']??[];$preview=preview_import($_SESSION['import'],$mapping,$school);$_SESSION['import_preview']=['mapping'=>$mapping,'nonce'=>bin2hex(random_bytes(24))];$out=$preview+['nonce'=>$_SESSION['import_preview']['nonce']];break;
            case 'import':
                $p=$_SESSION['import_preview']??null;if(!$p||!hash_equals($p['nonce'],(string)($body['nonce']??'')))fail('Confira a prévia antes de importar.');
                $out=commit_import($_SESSION['import'],$p['mapping'],$school);unset($_SESSION['import'],$_SESSION['import_preview']);audit('students.imported',$out['imported']);break;
            case 'create_exam':
                $out=transaction(function()use($body,$school,$u){
                    $scope=$body['scope']??'classes';
                    if($scope==='grade'){
                        $grade=text_field($body['grade_name']??'');
                        $cids=array_map('intval',array_column(rows('SELECT id FROM classes WHERE school_id=? AND grade_name=? ORDER BY id',[$school,$grade]),'id'));
                    }elseif($scope==='classes'){
                        $selected=$body['class_ids']??[($body['class_id']??0)];if(!is_array($selected))fail('Selecione uma ou mais turmas.');
                        $cids=array_values(array_unique(array_map('intval',$selected)));
                    }else fail('Abrangência inválida.');
                    if(!$cids)fail('Selecione ao menos uma turma cadastrada ou uma série com turmas.');
                    foreach($cids as $selected)if(!one('SELECT id FROM classes WHERE id=? AND school_id=?',[$selected,$school]))fail('Turma fora da escola ou não encontrada.');
                    $cid=$cids[0];
                    $name=text_field($body['name']??'');$date=(string)($body['date']??'');$d=DateTimeImmutable::createFromFormat('!Y-m-d',$date);if(!$d||$d->format('Y-m-d')!==$date)fail('Data inválida.');
                    $alt=(int)($body['alternatives']??5);if($alt<2||$alt>5)fail('Escolha de 2 a 5 alternativas.');
                    $areas=$body['areas']??[];if(!is_array($areas)||!count($areas)||count($areas)>30)fail('Cadastre entre 1 e 30 áreas.');$total=0;$names=[];
                    foreach($areas as &$a){$a['name']=text_field($a['name']??'');$key=mb_strtolower($a['name']);if(isset($names[$key]))fail('Áreas repetidas.');$names[$key]=true;$a['count']=(int)($a['count']??0);if($a['count']<1||$a['count']>240)fail('Cada área deve ter de 1 a 240 questões.');$total+=$a['count'];$answers=$a['answers']??[];if(count($answers)!==$a['count'])fail('Preencha todo o gabarito.');foreach($answers as $answer)if(!is_string($answer)||strlen($answer)!==1||$answer<'A'||$answer>chr(64+$alt))fail('Alternativa do gabarito inválida.');}unset($a);
                    if($total>240)fail('Limite de 240 questões por simulado, em até 4 folhas.');
                    if($scope==='grade'){
                        $students=array_map('intval',array_column(rows('SELECT s.id FROM students s JOIN classes c ON c.id=s.class_id WHERE s.school_id=? AND c.grade_name=?',[$school,$grade]),'id'));
                    }else{
                        $students=$body['students']??null;
                        if($students===null){$marks=implode(',',array_fill(0,count($cids),'?'));$students=array_column(rows('SELECT id FROM students WHERE school_id=? AND class_id IN ('.$marks.')',array_merge([$school],$cids)),'id');}
                        if(!is_array($students))fail('Participantes inválidos.');$students=array_values(array_unique(array_map('intval',$students)));
                    }
                    if(!$students)fail('Inclua pelo menos um estudante.');$studentClasses=[];
                    foreach($students as $sid){$s=one('SELECT class_id FROM students WHERE id=? AND school_id=?',[$sid,$school]);if(!$s||!in_array((int)$s['class_id'],$cids,true))fail('Estudante fora das turmas selecionadas.');$studentClasses[$sid]=(int)$s['class_id'];}
                    query('INSERT INTO exams(school_id,class_id,name,date,alternatives,created_by) VALUES(?,?,?,?,?,?)',[$school,$cid,$name,$date,$alt,$u['id']]);$eid=(int)db()->lastInsertId();$n=0;
                    foreach($areas as $pos=>$a){query('INSERT INTO areas(exam_id,name,position) VALUES(?,?,?)',[$eid,$a['name'],$pos]);$aid=(int)db()->lastInsertId();foreach($a['answers'] as $answer)query('INSERT INTO questions(exam_id,area_id,number,answer) VALUES(?,?,?,?)',[$eid,$aid,++$n,$answer]);}
                    foreach($cids as $selected)query('INSERT INTO exam_classes(exam_id,class_id) VALUES(?,?)',[$eid,$selected]);
                    foreach($students as $sid)query('INSERT INTO enrollments(exam_id,student_id,class_id) VALUES(?,?,?)',[$eid,$sid,$studentClasses[$sid]]);audit('exam.created',$eid);return ['id'=>$eid];});break;
            case 'exam': $out=exam_detail((int)($_GET['id']??0));break;
            case 'generate_cards':
                $id=(int)($body['exam_id']??0);$e=exam_detail($id);$count=(int)($body['count']??1);if($count<1||$count>200)fail('Gere de 1 a 200 conjuntos por lote.');
                $reusable=($body['reusable']??true)!==false;
                $out=transaction(function()use($e,$count,$reusable){
                    if($reusable){$existing=one('SELECT id FROM booklets WHERE exam_id=? AND reusable=1 AND template_id IS NULL ORDER BY id LIMIT 1',[$e['id']]);if($existing)return ['booklets'=>[(int)$existing['id']],'reusable'=>true];}
                    $ids=[];$total=count($e['questions']);for($i=0;$i<($reusable?1:$count);$i++){query('INSERT INTO booklets(exam_id,reusable) VALUES(?,?)',[$e['id'],$reusable?1:0]);$bid=(int)db()->lastInsertId();$ids[]=$bid;for($start=1,$page=1;$start<=$total;$start+=60,$page++)query('INSERT INTO cards(booklet_id,token,page,start_number,question_count) VALUES(?,?,?,?,?)',[$bid,bin2hex(random_bytes(16)),$page,$start,min(60,$total-$start+1)]);}audit('cards.generated',(int)$e['id']);return ['booklets'=>$ids,'reusable'=>$reusable];});break;
            case 'cards':
                $e=exam((int)($_GET['exam_id']??0));$out=['exam'=>$e,'questions'=>rows('SELECT q.number,a.name area FROM questions q JOIN areas a ON a.id=q.area_id WHERE q.exam_id=? ORDER BY q.number',[$e['id']]),'cards'=>rows('SELECT c.id,c.token,c.page,c.start_number,c.question_count,c.booklet_id,b.reusable FROM cards c JOIN booklets b ON b.id=c.booklet_id WHERE b.exam_id=? AND b.template_id IS NULL ORDER BY b.id,c.page',[$e['id']])];break;
            case 'identify': $out=identify_card((string)($_GET['token']??''),(int)($_GET['exam_id']??0));unset($out['scores']);break;
            case 'scan': $out=save_scan((int)($body['exam_id']??0),(string)($body['token']??''),(int)($body['student_id']??0),$body['scores']??[],$body['quality']??[]);break;
            case 'report':$out=report((int)($_GET['id']??0));break;
            case 'individual':$out=individual_report((int)($_GET['id']??0));break;
            case 'export':export_report((int)($_GET['id']??0));
            case 'team':if($u['role']!=='admin')fail('Acesso exclusivo de administrador.',403);$out=rows('SELECT id,name,email,role FROM users WHERE school_id=?',[$school]);break;
            case 'team_create':
                if($u['role']!=='admin')fail('Acesso exclusivo de administrador.',403);$email=mb_strtolower(text_field($body['email']??''));$pass=(string)($body['password']??'');if(!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($pass)<12||strlen($pass)>200)fail('Informe e-mail válido e senha de 12 a 200 caracteres.');if(one('SELECT id FROM users WHERE email=?',[$email]))fail('E-mail indisponível.');query('INSERT INTO users(school_id,name,email,password,role) VALUES(?,?,?,?,?)',[$school,text_field($body['name']??''),$email,password_hash($pass,PASSWORD_DEFAULT),'teacher']);audit('user.created',(int)db()->lastInsertId());$out=['message'=>'Professor cadastrado com acesso aos dados desta escola.'];break;
            default: fail('Operação não encontrada.',404);
        }
    }
    echo json_encode(['ok'=>true,'data'=>$out],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
}catch(AppError $e){http_response_code($e->getCode()?:422);echo json_encode(['ok'=>false,'error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);}
catch(Throwable $e){error_log('MarioProvas: '.get_class($e).' '.$e->getMessage());http_response_code(500);echo json_encode(['ok'=>false,'error'=>'Não foi possível concluir. Tente novamente ou consulte o administrador.']);}
