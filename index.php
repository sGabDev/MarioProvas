<?php
declare(strict_types=1);
// Location relativa funciona na raiz e em subpastas, inclusive no Apache Windows.
// Evita que mod_rewrite transforme um caminho do disco (C:/...) em uma URL.
header('Cache-Control: no-store, private');
header('Location: public/', true, 302);
exit;
