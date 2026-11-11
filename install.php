<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/app/bootstrap.php';
if(one('SELECT id FROM users LIMIT 1')){fwrite(STDERR,"Instalação já concluída.\n");exit(1);}
function prompt(string $label): string {echo $label.': ';return trim((string)fgets(STDIN));}
$school=prompt('Nome da escola');$name=prompt('Nome do administrador');$email=mb_strtolower(prompt('E-mail'));$password=prompt('Senha (mín. 12 caracteres; a entrada será visível neste terminal)');
if(!$school||!$name||!filter_var($email,FILTER_VALIDATE_EMAIL)||strlen($password)<12||strlen($password)>200){fwrite(STDERR,"Dados inválidos. Nada foi instalado.\n");exit(1);}
transaction(function()use($school,$name,$email,$password){query('INSERT INTO schools(name) VALUES(?)',[$school]);$id=db()->lastInsertId();query('INSERT INTO users(school_id,name,email,password,role) VALUES(?,?,?,?,?)',[$id,$name,$email,password_hash($password,PASSWORD_DEFAULT),'admin']);});
echo "MarioProvas instalado. Acesse a pasta public/ pelo navegador.\n";
