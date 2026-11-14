<?php
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
$checks=['PHP 8.2 ou superior'=>PHP_VERSION_ID>=80200,'PDO SQLite'=>extension_loaded('pdo_sqlite'),'mbstring'=>extension_loaded('mbstring'),'session'=>extension_loaded('session'),'JSON'=>extension_loaded('json'),'storage gravável'=>is_writable(dirname(__DIR__).'/storage'),'jsQR local'=>is_file(dirname(__DIR__).'/public/assets/vendor/jsQR.js'),'Gerador QR local'=>is_file(dirname(__DIR__).'/public/assets/vendor/qrcode.mjs'),'Gerador QR do PDF'=>is_file(dirname(__DIR__).'/app/vendor/qrcode/qrcode.php'),'Motor PDF'=>is_file(dirname(__DIR__).'/app/vendor/tfpdf/tfpdf.php'),'Ícones PWA'=>is_file(dirname(__DIR__).'/public/assets/icon-512.png')];
foreach($checks as $label=>$ok)echo ($ok?'OK   ':'FALHA').' '.$label.PHP_EOL;
exit(in_array(false,$checks,true)?1:0);
