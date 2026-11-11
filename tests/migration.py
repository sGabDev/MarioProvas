"""Confere a atualização em cópia privada dos dados existentes, sem alterar a origem."""
import hashlib,json,os,pathlib,sqlite3,subprocess,tempfile

root=pathlib.Path(__file__).resolve().parents[1]
source_path=root/'storage/marioprovas.sqlite'
if not source_path.exists():
    raise SystemExit('Este teste requer uma base local existente para verificar a preservação da migração.')
temp=pathlib.Path(tempfile.mkdtemp(prefix='marioprovas-upgrade-')).resolve()
target=temp/'upgrade.sqlite'
source=sqlite3.connect('file:'+source_path.resolve().as_posix()+'?mode=ro',uri=True)
copy=sqlite3.connect(target);source.backup(copy);source.close()
tables=['schools','users','classes','students','exams','areas','questions','enrollments','booklets','cards','results','responses']
added={'classes':['grade_name'],'enrollments':['class_id'],'booklets':['reusable','template_id']}
columns={t:[r[1] for r in copy.execute('PRAGMA table_info('+t+')') if r[1] not in added.get(t,[])] for t in tables}
def snapshot(conn):
    return {t:hashlib.sha256(repr(sorted(conn.execute('SELECT '+','.join(columns[t])+' FROM '+t).fetchall(),key=repr)).encode()).hexdigest() for t in tables}
before=snapshot(copy);copy.close()
env=os.environ.copy();env['MARIOPROVAS_DB']=str(target)
php=os.environ.get('PHP_BIN',r'C:\xampp\php\php.exe' if os.name=='nt' else 'php')
try:
    for _ in range(2):
        p=subprocess.run([php,'-r',"require 'app/bootstrap.php'; echo db()->query('PRAGMA user_version')->fetchColumn();"],cwd=root,env=env,capture_output=True,text=True,check=True)
        assert p.stdout=='1','Migração deve chegar à versão 1 e ser idempotente'
    copy=sqlite3.connect(target)
    assert before==snapshot(copy),'A migração deve preservar todas as linhas e colunas originais'
    assert copy.execute('SELECT COUNT(*) FROM exams e WHERE NOT EXISTS(SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=e.class_id)').fetchone()[0]==0
    assert copy.execute('SELECT COUNT(*) FROM enrollments WHERE class_id IS NULL').fetchone()[0]==0
    assert copy.execute('PRAGMA foreign_key_check').fetchall()==[]
    copy.close()
    print('OK: migração idempotente, dados antigos preservados, turmas vinculadas e integridade referencial válida em cópia privada.')
finally:
    assert temp.parent==pathlib.Path(tempfile.gettempdir()).resolve() and temp.name.startswith('marioprovas-upgrade-')
    for item in temp.iterdir():
        if item.is_file():item.unlink()
    temp.rmdir()
