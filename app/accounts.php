<?php
declare(strict_types=1);
const STAFF_SHIFTS=['morning','afternoon','evening','full_time'];
function require_manager(): array {
    $u=require_user();if(!in_array($u['role'],['admin','operator'],true))fail('Acesso exclusivo de administrador ou operador.',403);return $u;
}
function account_fields(array $body,bool $required): array {
    $name=text_field($body['name']??'');$email=mb_strtolower(text_field($body['email']??'',254));if(!filter_var($email,FILTER_VALIDATE_EMAIL))fail('Informe um e-mail válido.');
    $profile=['name'=>$name,'email'=>$email];
    foreach(['phone'=>40,'knowledge_area'=>180,'discipline'=>180] as $key=>$max){$value=strval_trim($body[$key]??'');$profile[$key]=$value===''&&!$required?'':text_field($value,$max);}
    if($profile['phone']!==''&&(!preg_match('/^[+0-9(). -]+$/D',$profile['phone'])||strlen(preg_replace('/\D/','',$profile['phone']))<10||strlen(preg_replace('/\D/','',$profile['phone']))>15))fail('Informe um telefone com DDD, de 10 a 15 dígitos.');
    $shifts=$body['shifts']??[];if(!is_array($shifts)||!array_is_list($shifts)||count($shifts)>4||($required&&!$shifts))fail('Selecione pelo menos um turno.');
    foreach($shifts as $shift)if(!is_string($shift)||!in_array($shift,STAFF_SHIFTS,true))fail('Turno inválido.');$profile['shifts']=array_values(array_unique($shifts));return $profile;
}
function account_password(mixed $value): string {
    if(!is_string($value)||strlen($value)<12||strlen($value)>200)fail('A senha deve ter de 12 a 200 caracteres.');return password_hash($value,PASSWORD_DEFAULT);
}
function registration_schools(): array {
    return rows("SELECT s.id,s.name FROM schools s WHERE EXISTS(SELECT 1 FROM users u WHERE u.school_id=s.id AND u.role='admin' AND u.status='active') ORDER BY s.name");
}
function register_account(array $body): array {
    $fields=account_fields($body,true);$hash=account_password($body['password']??null);
    $key=hash('sha256','register|'.($_SERVER['REMOTE_ADDR']??''));
    return transaction(function()use($fields,$body,$hash,$key){
        $attempt=one('SELECT * FROM login_attempts WHERE key=?',[$key]);if($attempt&&time()-(int)$attempt['started']<900&&(int)$attempt['attempts']>=8)fail('Muitos cadastros neste endereço. Aguarde 15 minutos.',429);
        $school=(int)($body['school_id']??0);if(!in_array($school,array_column(registration_schools(),'id'),true))fail('Selecione a escola do cadastro.');
        if(one('SELECT id FROM users WHERE email=?',[$fields['email']]))fail('Este e-mail já possui cadastro. Entre ou procure o administrador.',409);
        query("INSERT INTO users(school_id,name,email,password,role,phone,knowledge_area,discipline,shifts,status,registered_at) VALUES(?,?,?,?,'teacher',?,?,?,?,'pending',CURRENT_TIMESTAMP)",[$school,$fields['name'],$fields['email'],$hash,$fields['phone'],$fields['knowledge_area'],$fields['discipline'],json_encode($fields['shifts'])]);$id=(int)db()->lastInsertId();
        query("INSERT INTO audit(school_id,user_id,event,entity_id) VALUES(?,NULL,'user.registration_requested',?)",[$school,$id]);
        query('INSERT INTO login_attempts(key,attempts,started) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN started<? THEN 1 ELSE attempts+1 END,started=CASE WHEN started<? THEN excluded.started ELSE started END',[$key,time(),time()-900,time()-900]);
        return ['message'=>'Cadastro enviado. Aguarde a aprovação de um administrador ou operador da escola para entrar.'];
    });
}
function staff_list(): array {
    $u=require_manager();return array_map('user_profile',rows('SELECT id,school_id,name,email,role,is_operator,phone,knowledge_area,discipline,shifts,status,profile_revision,registered_at,approved_at FROM users WHERE school_id=? ORDER BY CASE status WHEN \'pending\' THEN 0 WHEN \'active\' THEN 1 ELSE 2 END,name',[$u['school_id']]));
}
function staff_target(int $id,array $actor): array {
    $target=one('SELECT * FROM users WHERE id=? AND school_id=?',[$id,$actor['school_id']]);if(!$target)fail('Usuário não encontrado.',404);
    if($actor['role']==='operator'&&$id!==(int)$actor['id']&&($target['role']==='admin'||$target['is_operator']))fail('Somente administradores alteram administradores e operadores.',403);return $target;
}
function staff_role(mixed $role,array $actor): array {
    if(!is_string($role)||!in_array($role,['admin','operator','teacher'],true))fail('Perfil inválido.');
    if($actor['role']!=='admin'&&$role!=='teacher')fail('Somente administradores definem perfis de gestão.',403);
    return [$role==='admin'?'admin':'teacher',$role==='operator'?1:0];
}
function create_staff(array $body): array {
    $actor=require_manager();$fields=account_fields($body,false);$hash=account_password($body['password']??null);[$role,$operator]=staff_role($body['role']??'teacher',$actor);
    return transaction(function()use($actor,$fields,$hash,$role,$operator){
        require_manager();
        if(one('SELECT id FROM users WHERE email=?',[$fields['email']]))fail('E-mail já cadastrado.',409);
        query("INSERT INTO users(school_id,name,email,password,role,is_operator,phone,knowledge_area,discipline,shifts,status,registered_at,approved_at,approved_by) VALUES(?,?,?,?,?,?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)",[$actor['school_id'],$fields['name'],$fields['email'],$hash,$role,$operator,$fields['phone'],$fields['knowledge_area'],$fields['discipline'],json_encode($fields['shifts']),$actor['id']]);$id=(int)db()->lastInsertId();audit('user.created_authorized',$id);return ['id'=>$id,'message'=>'Usuário criado e autorizado.'];
    });
}
function update_staff(array $body): array {
    $actor=require_manager();$fields=account_fields($body,false);$hash=isset($body['password'])&&$body['password']!==''?account_password($body['password']):null;
    return transaction(function()use($actor,$fields,$hash,$body){
        require_manager();
        $id=(int)($body['id']??0);$old=staff_target($id,$actor);if((int)($body['profile_revision']??0)!==(int)$old['profile_revision'])fail('Cadastro alterado. Reabra a edição para conferir.',409);
        $oldRole=$old['role']==='admin'?'admin':($old['is_operator']?'operator':'teacher');$requested=$body['role']??$oldRole;
        if($id===(int)$actor['id']){if($requested!==$oldRole)fail('Você não pode alterar seu próprio perfil de acesso.');[$role,$operator]=[$old['role'],(int)$old['is_operator']];}
        else {[$role,$operator]=staff_role($requested,$actor);}
        if($old['role']==='admin'&&$old['status']==='active'&&$role!=='admin'&&(int)one("SELECT COUNT(*) n FROM users WHERE school_id=? AND role='admin' AND status='active'",[$actor['school_id']])['n']<=1)fail('Mantenha pelo menos um administrador ativo.');
        if(one('SELECT id FROM users WHERE email=? AND id<>?',[$fields['email'],$id]))fail('E-mail já cadastrado.',409);
        $revoke=$hash!==null||$role!==$old['role']||$operator!==(int)$old['is_operator']||$fields['email']!==$old['email'];
        query('UPDATE users SET name=?,email=?,phone=?,knowledge_area=?,discipline=?,shifts=?,role=?,is_operator=?,password=?,auth_version=auth_version+?,profile_revision=profile_revision+1 WHERE id=?',[$fields['name'],$fields['email'],$fields['phone'],$fields['knowledge_area'],$fields['discipline'],json_encode($fields['shifts']),$role,$operator,$hash??$old['password'],$revoke?1:0,$id]);
        // Mantém a sessão do gestor quando ele altera seus próprios dados.
        if($id===(int)$actor['id']&&$revoke)$_SESSION['auth_version']=(int)$old['auth_version']+1;
        audit('user.updated',$id);return ['message'=>'Usuário atualizado.','user'=>current_user()];
    });
}
function review_staff(array $body): array {
    $actor=require_manager();return transaction(function()use($actor,$body){
        require_manager();
        $id=(int)($body['id']??0);$old=staff_target($id,$actor);if($id===(int)$actor['id'])fail('Você não pode suspender ou aprovar seu próprio acesso.');
        if((int)($body['profile_revision']??0)!==(int)$old['profile_revision'])fail('Cadastro alterado. Atualize a lista para conferir.',409);
        $action=$body['decision']??'';if(!is_string($action))fail('Decisão inválida.');$status=['approve'=>'active','reject'=>'rejected','block'=>'blocked'][$action]??null;if(!$status)fail('Decisão inválida.');
        if($action==='reject'&&$old['status']!=='pending')fail('Somente solicitações pendentes podem ser recusadas.');
        if($status===$old['status'])fail('O usuário já está nessa situação.',409);
        if($old['role']==='admin'&&$status!=='active'&&(int)one("SELECT COUNT(*) n FROM users WHERE school_id=? AND role='admin' AND status='active'",[$actor['school_id']])['n']<=1)fail('Mantenha pelo menos um administrador ativo.');
        query('UPDATE users SET status=?,auth_version=auth_version+1,profile_revision=profile_revision+1,approved_by=?,approved_at=CASE WHEN ?=\'active\' THEN CURRENT_TIMESTAMP ELSE approved_at END WHERE id=?',[$status,$actor['id'],$status,$id]);audit('user.'.$action,$id);return ['message'=>['approve'=>'Acesso autorizado.','reject'=>'Solicitação recusada.','block'=>'Acesso suspenso.'][$action]];
    });
}
