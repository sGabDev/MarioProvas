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
        assert p.stdout=='2','Migração deve chegar à versão 2 e ser idempotente'
    copy=sqlite3.connect(target)
    assert before==snapshot(copy),'A migração deve preservar todas as linhas e colunas originais'
    assert copy.execute('SELECT COUNT(*) FROM exams e WHERE NOT EXISTS(SELECT 1 FROM exam_classes ec WHERE ec.exam_id=e.id AND ec.class_id=e.class_id)').fetchone()[0]==0
    assert copy.execute('SELECT COUNT(*) FROM enrollments WHERE class_id IS NULL').fetchone()[0]==0
    assert copy.execute('PRAGMA foreign_key_check').fetchall()==[]
    # Resultado legado em cópia: branco/múltiplas deixam de ser anuladas,
    # mas as marcas e evidências originais devem sobreviver à atualização.
    school,uid=copy.execute('SELECT school_id,id FROM users LIMIT 1').fetchone()
    sid,cid=copy.execute('SELECT id,class_id FROM students WHERE school_id=? LIMIT 1',(school,)).fetchone()
    eid=copy.execute("INSERT INTO exams(school_id,class_id,name,date,alternatives,created_by) VALUES(?,?,'MIGRAÇÃO ISOLADA','2026-11-11',5,?)",(school,cid,uid)).lastrowid
    aid=copy.execute("INSERT INTO areas(exam_id,name,position) VALUES(?,'Verificação',0)",(eid,)).lastrowid
    qs=[copy.execute('INSERT INTO questions(exam_id,area_id,number,answer) VALUES(?,?,?,?)',(eid,aid,i+1,'A')).lastrowid for i in range(3)]
    copy.execute('INSERT INTO enrollments(exam_id,student_id,class_id) VALUES(?,?,?)',(eid,sid,cid))
    bid=copy.execute('INSERT INTO booklets(exam_id,student_id) VALUES(?,?)',(eid,sid)).lastrowid
    token='f0e1d2c3b4a5968778695a4b3c2d1e0f'
    copy.execute('INSERT INTO cards(booklet_id,token,page,start_number,question_count,scores,scanned_at) VALUES(?,?,1,1,3,?,?)',(bid,token,'[[1,0],[0,0],[1,1]]','2026-11-11 10:00:00'))
    rid=copy.execute('INSERT INTO results(exam_id,student_id,booklet_id,correct,valid,annulled,percentage) VALUES(?,?,?,1,1,2,100)',(eid,sid,bid)).lastrowid
    copy.executemany('INSERT INTO responses(result_id,question_id,marked,status) VALUES(?,?,?,?)',[(rid,qs[0],'A','correct'),(rid,qs[1],'','blank'),(rid,qs[2],'A,B','multiple')])
    copy.execute("CREATE TABLE old_responses(result_id INTEGER NOT NULL REFERENCES results(id),question_id INTEGER NOT NULL REFERENCES questions(id),marked TEXT,status TEXT NOT NULL CHECK(status IN ('correct','incorrect','blank','multiple')),PRIMARY KEY(result_id,question_id))")
    copy.execute('INSERT INTO old_responses SELECT * FROM responses');copy.execute('DROP TABLE responses');copy.execute('ALTER TABLE old_responses RENAME TO responses')
    copy.execute('PRAGMA user_version=1');copy.commit();copy.close()
    for _ in range(2):subprocess.run([php,'-r',"require 'app/bootstrap.php'; db();"],cwd=root,env=env,capture_output=True,text=True,check=True)
    copy=sqlite3.connect(target)
    assert copy.execute('SELECT correct,valid,annulled,percentage,credited,grade FROM results WHERE id=?',(rid,)).fetchone()==(1,3,0,33.33,0,None)
    assert copy.execute('SELECT marked,status FROM responses WHERE result_id=? ORDER BY question_id',(rid,)).fetchall()==[('A','correct'),('','blank'),('A,B','multiple')]
    assert copy.execute('SELECT token,scores,scanned_at FROM cards WHERE booklet_id=?',(bid,)).fetchone()==(token,'[[1,0],[0,0],[1,1]]','2026-11-11 10:00:00')
    assert copy.execute('PRAGMA foreign_key_check').fetchall()==[]
    copy.close()
    print('OK: migração v2 idempotente, cadastros/tokens/marcações preservados, resultado legado recalculado (branco/múltiplas como erros), integridade referencial válida em cópia privada.')
finally:
    assert temp.parent==pathlib.Path(tempfile.gettempdir()).resolve() and temp.name.startswith('marioprovas-upgrade-')
    for item in temp.iterdir():
        if item.is_file():item.unlink()
    temp.rmdir()
