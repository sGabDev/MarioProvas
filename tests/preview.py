"""Preview visual isolado: não importa estudantes e não usa a base de produção."""
import os,pathlib,subprocess,tempfile
root=pathlib.Path(__file__).resolve().parents[1]
tmp=pathlib.Path(tempfile.mkdtemp(prefix='marioprovas-preview-')).resolve()
env=os.environ.copy();env['MARIOPROVAS_DB']=str(tmp/'preview.sqlite');env['MARIOPROVAS_SETUP_KEY']=''
php=os.environ.get('PHP_BIN',r'C:\xampp\php\php.exe' if os.name=='nt' else 'php')
code="require 'app/bootstrap.php'; query('INSERT INTO schools(name) VALUES(?)',['Ambiente de verificação']);query('INSERT INTO users(school_id,name,email,password,role) VALUES(?,?,?,?,?)',[1,'Professor','qa@example.invalid',password_hash('MarioProvasTeste2026!',PASSWORD_DEFAULT),'admin']);"
subprocess.run([php,'-r',code],cwd=root,env=env,check=True)
server=subprocess.Popen([php,'-S','127.0.0.1:8085','-t',str(root/'public')],cwd=root,env=env)
try:server.wait()
except KeyboardInterrupt:server.terminate();server.wait(timeout=10)
finally:
    assert tmp.parent==pathlib.Path(tempfile.gettempdir()).resolve() and tmp.name.startswith('marioprovas-preview-')
    for f in tmp.iterdir():
        if f.is_file():f.unlink()
    tmp.rmdir()
