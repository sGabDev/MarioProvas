<?php
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
header('Permissions-Policy: camera=(self), microphone=(), geolocation=()');
?>
<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#142b28"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="description" content="MarioProvas — simulados, cartões-resposta e acompanhamento da aprendizagem."><title>MarioProvas</title><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="assets/icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="assets/icon-192.png"><link rel="stylesheet" href="assets/tokens.css?v=ui9"><link rel="stylesheet" href="assets/app.css?v=bank3"><link rel="stylesheet" href="assets/scanner.css?v=ui9"><script src="assets/vendor/jsQR.js" defer></script><script type="module" src="assets/app.mjs?v=id1"></script></head>
<body><a class="skip" href="#main">Ir para o conteúdo</a><div id="app"><div class="loading">Carregando MarioProvas…</div></div><div id="toast" role="status" aria-live="polite"></div><dialog id="modal"></dialog><noscript>Ative o JavaScript para importar dados e usar a câmera.</noscript></body></html>
