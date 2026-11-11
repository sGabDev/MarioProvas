<?php
declare(strict_types=1);
date_default_timezone_set('America/Sao_Paulo');
ini_set('display_errors', '0');
$configFile = dirname(__DIR__) . '/config.php';
$config = is_file($configFile) ? require $configFile : [];
$config += ['database' => getenv('MARIOPROVAS_DB') ?: dirname(__DIR__) . '/storage/marioprovas.sqlite', 'setup_key' => getenv('MARIOPROVAS_SETUP_KEY') ?: '', 'session_name' => 'marioprovas'];
// Variáveis definidas pelo operador também isolam testes quando há config.php local.
foreach (['MARIOPROVAS_DB'=>'database','MARIOPROVAS_SETUP_KEY'=>'setup_key'] as $env=>$key) {
    if (getenv($env) !== false) $config[$key] = getenv($env);
}
require_once __DIR__.'/migrations.php';
function db(): PDO {
    global $config;
    static $db;
    if (!$db) {
        if (!is_dir(dirname($config['database']))) mkdir(dirname($config['database']),0700,true);
        $db = new PDO('sqlite:' . $config['database'], null, null, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
        $db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
        $db->exec(file_get_contents(__DIR__.'/schema.sql'));
        migrate($db);
        @chmod($config['database'],0600);
    }
    return $db;
}
function query(string $sql, array $args=[]): PDOStatement { $s=db()->prepare($sql); $s->execute($args); return $s; }
function rows(string $sql, array $args=[]): array { return query($sql,$args)->fetchAll(); }
function one(string $sql, array $args=[]): ?array { return query($sql,$args)->fetch() ?: null; }
function fail(string $message, int $code=422): never { throw new AppError($message,$code); }
class AppError extends RuntimeException {}
function strval_trim(mixed $v): string { return is_scalar($v) ? trim((string)$v) : ''; }
function text_field(mixed $v, int $max=180): string { $v=strval_trim($v); if($v==='' || mb_strlen($v)>$max || preg_match('/[\x00-\x1F]/u',$v)) fail('Campo obrigatório ausente ou inválido.'); return $v; }
function transaction(callable $fn): mixed { db()->exec('BEGIN IMMEDIATE'); try {$r=$fn();db()->exec('COMMIT');return $r;} catch(Throwable $e){db()->exec('ROLLBACK');throw $e;} }
function audit(string $event, int $id=0): void { $u=current_user(); query('INSERT INTO audit(school_id,user_id,event,entity_id) VALUES(?,?,?,?)',[$u['school_id'],$u['id'],$event,$id]); }
function current_user(): ?array { return isset($_SESSION['uid']) ? one('SELECT id,school_id,name,email,role FROM users WHERE id=?',[$_SESSION['uid']]) : null; }
function require_user(): array { $u=current_user(); if(!$u) fail('Entre para continuar.',401); return $u; }
function with_exam_classes(array $e): array {
    if(isset($e['grading_policy'])&&is_string($e['grading_policy']))$e['grading_policy']=json_decode($e['grading_policy'],true);
    $e['classes']=rows('SELECT c.id,c.name,c.grade_name FROM exam_classes ec JOIN classes c ON c.id=ec.class_id WHERE ec.exam_id=? ORDER BY c.name',[$e['id']]);
    $e['class_ids']=array_map('intval',array_column($e['classes'],'id'));
    $e['class_name']=implode(' · ',array_column($e['classes'],'name'));
    return $e;
}
function exam(int $id): array { $u=require_user(); $e=one('SELECT * FROM exams WHERE id=? AND school_id=?',[$id,$u['school_id']]); if(!$e) fail('Simulado não encontrado.',404); return with_exam_classes($e); }
function exam_detail(int $id): array {
    $e=exam($id);
    $e['areas']=rows('SELECT a.*,COUNT(q.id) count FROM areas a JOIN questions q ON q.area_id=a.id WHERE a.exam_id=? GROUP BY a.id ORDER BY a.position',[$id]);
    $e['questions']=rows('SELECT q.*,a.name area FROM questions q JOIN areas a ON a.id=q.area_id WHERE q.exam_id=? ORDER BY q.number',[$id]);
    $e['students']=rows('SELECT s.*,ec.name class_name,en.class_id enrollment_class_id,r.id result_id,b.id booklet_id,b.template_id FROM enrollments en JOIN students s ON s.id=en.student_id JOIN classes ec ON ec.id=en.class_id LEFT JOIN results r ON r.student_id=s.id AND r.exam_id=en.exam_id LEFT JOIN booklets b ON b.student_id=s.id AND b.exam_id=en.exam_id WHERE en.exam_id=? ORDER BY ec.name,s.name',[$id]);
    $pages=rows('SELECT b.student_id,c.page FROM booklets b JOIN cards c ON c.booklet_id=b.id WHERE b.exam_id=? AND b.student_id IS NOT NULL AND c.scanned_at IS NOT NULL',[$id]);
    foreach($e['students'] as &$s) $s['scanned_pages']=array_column(array_filter($pages,fn($p)=>$p['student_id']===$s['id']),'page');unset($s);
    $e['booklets']=rows('SELECT b.id,b.student_id,b.reusable,COUNT(c.id) pages,SUM(c.scanned_at IS NOT NULL) scanned,(SELECT COUNT(*) FROM booklets x WHERE x.template_id=b.id) uses,(SELECT COUNT(*) FROM results r JOIN booklets x ON x.id=r.booklet_id WHERE x.template_id=b.id) completed FROM booklets b JOIN cards c ON c.booklet_id=b.id WHERE b.exam_id=? AND b.template_id IS NULL GROUP BY b.id ORDER BY b.id',[$id]);
    return $e;
}
function start_session(): void {
    global $config;
    ini_set('session.use_strict_mode','1'); ini_set('session.use_only_cookies','1');
    session_name($config['session_name']);
    session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off','httponly'=>true,'samesite'=>'Strict']);
    session_start();
    if(isset($_SESSION['last']) && time()-$_SESSION['last']>7200) {$_SESSION=[];session_regenerate_id(true);}
    $_SESSION['last']=time(); $_SESSION['csrf']??=bin2hex(random_bytes(32));
}
