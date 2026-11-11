"""Verifica .htaccess no Apache local, sem ler/gravar a base escolar.
Fixtures de código inofensivas são criadas temporariamente na raiz servida.
"""
import os, pathlib, shutil, tempfile, urllib.request, urllib.error, urllib.parse

ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=os.environ.get('MARIOPROVAS_APACHE_URL','http://localhost/').rstrip('/')+'/'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
plain=urllib.request.build_opener(NoRedirect)
checks=0
def request(url,data=None,follow=True):
    opener=urllib.request.urlopen if follow else plain.open
    try:return opener(urllib.request.Request(url,data=data),timeout=8)
    except urllib.error.HTTPError as error:return error
def expect(path,status=200,contains=None,base=BASE):
    global checks
    with request(base+path) as response:
        assert response.status==status,(path,response.status,status)
        if contains is not None:assert contains in response.read()
    checks+=1

expect('',contains=b'assets/app.mjs?v=ui9')
expect('print?exam=1&sets=2',contains=b'assets/print.mjs?v=ui9')
with request(BASE+'public/print.html?exam=1&sets=2') as response:
    assert response.status==200 and response.url==BASE+'print?exam=1&sets=2'
checks+=1
for legacy,clean in [('print.html?exam=1&sets=2','print?exam=1&sets=2'),('public/',''),('index.php',''),('print/','print'),('offline.html','offline')]:
    with request(BASE+legacy) as response:assert response.status==200 and response.url==BASE+clean
    checks+=1
expect('assets/vendor/qrcode.mjs?v=ui9',contains=b'export default qrcode;')
for private in ['config.php','config.example%20copy.php','app/schema.sql','storage/marioprovas.sqlite','README.md','.htaccess']:
    expect(private,status=403)

fixture=pathlib.Path(tempfile.mkdtemp(prefix='routing-test-',dir=ROOT)).resolve()
try:
    # Raiz completa em subpasta e document root direto no diretório público.
    fixture.joinpath('.htaccess').write_bytes(ROOT.joinpath('.htaccess').read_bytes())
    for directory in [fixture/'public',fixture/'direct']:
        directory.mkdir();directory.joinpath('.htaccess').write_bytes(ROOT.joinpath('public/.htaccess').read_bytes())
        directory.joinpath('index.php').write_text('<?php echo "ROUTE-INDEX";',encoding='utf-8')
        directory.joinpath('print.html').write_text('<!doctype html><p>ROUTE-PRINT</p>',encoding='utf-8')
        directory.joinpath('offline.html').write_text('<!doctype html><p>ROUTE-OFFLINE</p>',encoding='utf-8')
        directory.joinpath('api.php').write_text('<?php header("Content-Type: application/json"); echo json_encode(["method"=>$_SERVER["REQUEST_METHOD"],"body"=>file_get_contents("php://input")]);',encoding='utf-8')
        (directory/'assets').mkdir();directory.joinpath('assets/probe.mjs').write_text('export default true;',encoding='utf-8')
    fixture.joinpath('config.php').write_text('<?php // private fixture',encoding='utf-8')
    for suffix in ['', 'direct/']:
        base=BASE+fixture.name+'/'+suffix
        expect('',contains=b'ROUTE-INDEX',base=base)
        expect('print?exam=1&sets=2',contains=b'ROUTE-PRINT',base=base)
        expect('assets/probe.mjs',contains=b'export default true;',base=base)
        for legacy in ['public/print.html?exam=1&sets=2','print.html?exam=1&sets=2','public/print?exam=1&sets=2']:
            with request(base+legacy) as response:
                assert response.status==200 and response.url==base+'print?exam=1&sets=2',(legacy,response.url)
            checks+=1
        with request(base+'public/api.php?action=probe',data=b'preserve-body',follow=False) as response:
            assert response.status==307
            target=urllib.parse.urljoin(base,response.headers['Location'])
        with request(target,data=b'preserve-body') as response:
            assert response.status==200 and b'"method":"POST","body":"preserve-body"' in response.read()
        checks+=1
    expect('config.php',status=403,base=BASE+fixture.name+'/')
finally:
    # Verificação absoluta antes da remoção recursiva, restrita à fixture.
    assert fixture.parent==ROOT and fixture.name.startswith('routing-test-')
    shutil.rmtree(fixture)
print(f'OK: {checks} verificações Apache — raiz, subpasta, document root público, redirecionamentos/query, POST 307, módulo QR e bloqueios privados. Sem acesso à base escolar.')
