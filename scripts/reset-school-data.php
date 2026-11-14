<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
if(($argv[1]??'')!=='--execute'){fwrite(STDERR,"Limpa os dados escolares, preserva escolas/usuários e cadastra 20 questões por escola.\nUso: php scripts/reset-school-data.php --execute [caminho-privado-novo-do-backup.sqlite]\n");exit(1);}
require dirname(__DIR__).'/app/bootstrap.php';
try {
    $db=db();$tables=['responses','results','cards','version_questions','question_snapshots','exam_versions','booklets','enrollments','exam_classes','questions','areas','exams','question_bank','question_images','exam_covers','students','classes','audit','login_attempts'];
    $actual=array_column(rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"),'name');
    if(array_diff($actual,array_merge($tables,['schools','users'])))throw new RuntimeException('Há tabelas adicionais. Revise a limpeza antes de executar.');
    $schools=rows('SELECT s.id,(SELECT id FROM users u WHERE u.school_id=s.id ORDER BY CASE role WHEN \'admin\' THEN 0 ELSE 1 END,id LIMIT 1) owner FROM schools s');
    foreach($schools as $school)if(!$school['owner'])throw new RuntimeException('Há escola sem usuário responsável. Revise antes de executar.');
    $seed=json_decode(file_get_contents(dirname(__DIR__).'/app/data/starter-questions.json'),true,512,JSON_THROW_ON_ERROR);if(count($seed)!==20)throw new RuntimeException('O banco inicial deve ter 20 questões.');
    foreach($seed as $q)if(count($q['options'])!==5||!in_array($q['answer'],['A','B','C','D','E'],true))throw new RuntimeException('Questão inicial inválida.');
    $before=rows('SELECT * FROM users ORDER BY id');
    $target=$argv[2]??dirname($config['database']).'/marioprovas-antes-limpeza-'.date('Ymd-His').'-'.bin2hex(random_bytes(3)).'.sqlite';
    $dir=realpath(dirname($target));$public=realpath(dirname(__DIR__).'/public');
    if(!$dir||file_exists($target)||str_starts_with(strtolower(str_replace('\\','/',$dir)).'/',strtolower(str_replace('\\','/',$public)).'/'))throw new RuntimeException('Informe um arquivo de backup novo, em pasta privada fora de public/.');
    $target=$dir.DIRECTORY_SEPARATOR.basename($target);$db->exec('VACUUM INTO '.$db->quote($target));@chmod($target,0600);
    transaction(function()use($db,$tables,$schools,$seed,$before){
        foreach($tables as $table)$db->exec('DELETE FROM "'.$table.'"');
        foreach($schools as $school)foreach($seed as $q)query('INSERT INTO question_bank(school_id,statement,options,answer,discipline,area,subject,difficulty,created_by) VALUES(?,?,?,?,?,?,?,?,?)',[$school['id'],$q['statement'],json_encode($q['options'],JSON_UNESCAPED_UNICODE),$q['answer'],$q['discipline'],$q['area'],$q['subject'],$q['difficulty'],$school['owner']]);
        if($before!==rows('SELECT * FROM users ORDER BY id'))throw new RuntimeException('Falha ao preservar usuários.');
        // Exige novo login, impedindo uso de prévias e importações da base anterior.
        $db->exec('UPDATE users SET auth_version=auth_version+1');
        if(rows('PRAGMA foreign_key_check'))throw new RuntimeException('Integridade referencial inválida.');
    });
    $db->exec('VACUUM');$db->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    echo json_encode(['message'=>'Dados escolares limpos. Usuários, senhas e escolas preservados. Entre novamente.','users'=>count($before),'schools'=>count($schools),'questions'=>(int)one('SELECT COUNT(*) n FROM question_bank')['n'],'backup'=>$target],JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
}catch(Throwable $e){fwrite(STDERR,$e->getMessage().PHP_EOL);exit(1);}
