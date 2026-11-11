<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require dirname(__DIR__).'/app/bootstrap.php';
$target=$argv[1]??'';
if(!$target || file_exists($target)){fwrite(STDERR,"Informe um destino privado novo: php scripts/backup.php /backup/marioprovas-DATA.sqlite\n");exit(1);}
$dir=realpath(dirname($target));$public=realpath(dirname(__DIR__).'/public');
if(!$dir || str_starts_with(strtolower(str_replace('\\','/',$dir)).'/',strtolower(str_replace('\\','/',$public)).'/')){fwrite(STDERR,"Destino deve estar em diretório privado existente fora de public/.\n");exit(1);}
db()->exec('VACUUM INTO '.db()->quote($dir.DIRECTORY_SEPARATOR.basename($target)));@chmod($target,0600);echo "Backup consistente criado. Guarde-o em local privado.\n";
