<?php
declare(strict_types=1);
// Apenas para php -S. Em produção Apache/LiteSpeed usam os .htaccess.
$request = parse_url($_SERVER['REQUEST_URI'] ?? '/');
$path = '/' . ltrim(str_replace('\\', '/', rawurldecode($request['path'] ?? '/')), '/');
$query = isset($request['query']) ? '?' . $request['query'] : '';
foreach (explode('/', $path) as $segment) {
    if ($segment !== '' && str_starts_with($segment, '.')) {
        http_response_code(404);
        exit;
    }
}
if ($path === '/public' || str_starts_with($path, '/public/')) {
    header('Location: /' . ltrim(substr($path, 7), '/') . $query, true, 307);
    exit;
}
$redirects = ['/print.html'=>'/print', '/offline.html'=>'/offline', '/index.php'=>'/', '/print/'=>'/print', '/offline/'=>'/offline'];
if (isset($redirects[$path])) {
    header('Location: ' . $redirects[$path] . $query, true, 302);
    exit;
}
$pages = ['/print'=>'print.html', '/offline'=>'offline.html'];
if (isset($pages[$path])) {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store, private');
    readfile(dirname(__DIR__) . '/public/' . $pages[$path]);
    return true;
}
$root = realpath(dirname(__DIR__) . '/public');
$file = realpath($root . $path);
if ($path === '/' || ($file !== false && str_starts_with($file, $root . DIRECTORY_SEPARATOR) && is_file($file))) {
    return false;
}
http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Página não encontrada.';
