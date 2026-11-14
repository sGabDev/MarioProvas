"""Verificações de exclusão chamadas dentro do banco temporário de bank_integration."""
import json,os,subprocess,sqlite3
from contextlib import closing

def verify(c,Client,dbpath,eid,multi,students,password,base,root):
    assert dbpath.parent.name.startswith('marioprovas-bank-')
    teacher_email='delete-teacher@example.invalid';operator_email='delete-operator@example.invalid'
    for email,role in [(teacher_email,'teacher'),(operator_email,'operator')]:c.call('team_create',{'name':'Perfil de teste de exclusão','email':email,'password':password,'role':role})
    teacher=Client();teacher.call('state');teacher.call('login',{'email':teacher_email,'password':password})
    operator=Client();operator.call('state');operator.call('login',{'email':operator_email,'password':password})
    anonymous=Client();anonymous.call('state');anonymous.call('exam_deletion_preview',exam_id=eid,expected=401);anonymous.call('delete_exam',{'exam_id':eid},expected=401)
    teacher.call('exam_deletion_preview',exam_id=eid,expected=403);teacher.call('delete_exam',{'exam_id':eid},expected=403)
    c.call('delete_exam',expected=405);c.call('delete_exam',{'exam_id':eid},expected=409)
    with closing(sqlite3.connect(dbpath)) as db,db:
        other=db.execute('SELECT school_id FROM users WHERE email=?',('other@example.invalid',)).fetchone()[0]
        hashed=db.execute('SELECT password FROM users WHERE email=?',(operator_email,)).fetchone()[0]
        db.execute("INSERT INTO users(school_id,name,email,password,role) VALUES(?,?,?,?,'admin')",(other,'Gestor de outra escola','delete-other@example.invalid',hashed))
    other=Client();other.call('state');other.call('login',{'email':'delete-other@example.invalid','password':password})
    other.call('exam_deletion_preview',exam_id=eid,expected=404);other.call('delete_exam',{'exam_id':eid},expected=404)
    browser_env=os.environ.copy();browser_env.update(MARIOPROVAS_TEST_URL=base,MARIOPROVAS_TEST_EMAIL='bank@example.invalid',MARIOPROVAS_TEST_PASSWORD=password,MARIOPROVAS_DELETE_TEACHER=teacher_email,MARIOPROVAS_DELETE_OPERATOR=operator_email,MARIOPROVAS_TEST_EXAM=str(eid))
    subprocess.run(['node','tests/exam-deletion-browser.mjs'],cwd=root,env=browser_env,check=True,timeout=100)
    before=c.call('exam_deletion_preview',exam_id=eid);assert before['results']>=3 and before['versions']>=3 and before['scanned_pages']>=3
    c.call('delete_exam',{'exam_id':eid,'nonce':before['nonce']},csrf=False,expected=403)
    c.call('delete_exam',{'exam_id':eid,'nonce':'invalid'},expected=409)
    stale=operator.call('exam_deletion_preview',exam_id=eid);c.call('add_versions',{'exam_id':eid,'count':1})
    operator.call('delete_exam',{'exam_id':eid,'nonce':stale['nonce']},expected=409)
    with closing(sqlite3.connect(dbpath)) as db:
        keep={t:db.execute('SELECT * FROM '+t+' ORDER BY id').fetchall() for t in ['students','classes','users','question_bank','question_images','exam_covers']}
        question_ids=[r[0] for r in db.execute('SELECT id FROM questions WHERE exam_id=?',(eid,))]
        version_ids=[r[0] for r in db.execute('SELECT id FROM exam_versions WHERE exam_id=?',(eid,))]
        result_ids=[r[0] for r in db.execute('SELECT id FROM results WHERE exam_id=?',(eid,))]
    token=c.call('cards',exam_id=eid)['cards'][0]['token'];protected=c.call('version_content',exam_id=multi,version_id=c.call('exam',id=multi)['versions'][0]['id'])
    ready=operator.call('exam_deletion_preview',exam_id=eid)
    c.call('delete_exam',{'exam_id':eid,'nonce':ready['nonce']},expected=409)
    operator.call('delete_exam',{'exam_id':eid,'nonce':ready['nonce']})
    for action,params in [('exam',{'id':eid}),('cards',{'exam_id':eid}),('report',{'id':eid}),('identify',{'exam_id':eid,'token':token}),('exam_pdf',{'exam_id':eid}),('individual',{'id':result_ids[0]})]:c.call(action,expected=404,**params)
    assert protected==c.call('version_content',exam_id=multi,version_id=protected['id'])
    assert all(e['id']!=eid for e in c.call('dashboard')['exams'])
    with closing(sqlite3.connect(dbpath)) as db:
        for t,rows in keep.items():assert db.execute('SELECT * FROM '+t+' ORDER BY id').fetchall()==rows,t
        for t in ['exams','areas','questions','booklets','enrollments','exam_classes','exam_versions','results']:
            key='id' if t=='exams' else 'exam_id';assert not db.execute('SELECT 1 FROM '+t+' WHERE '+key+'=?',(eid,)).fetchall(),t
        assert not db.execute('SELECT 1 FROM question_snapshots WHERE question_id IN ('+','.join('?'*len(question_ids))+')',question_ids).fetchall()
        assert not db.execute('SELECT 1 FROM version_questions WHERE version_id IN ('+','.join('?'*len(version_ids))+')',version_ids).fetchall()
        assert db.execute("SELECT COUNT(*) FROM audit WHERE event='exam.deleted' AND entity_id=?",(eid,)).fetchone()[0]==1
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
    # Exclui também avaliação com resultado completo e outra tentativa parcial.
    cards=c.call('cards',exam_id=multi)['cards'];first=cards[0]
    marks=[[1 if i==ord(q['answer'])-65 else 0 for i in range(5)] for q in protected['questions'][:60]]
    pending=c.call('scan',{'exam_id':multi,'token':first['token'],'student_id':students[1],'scores':marks,'quality':{'markerCount':4,'contrast':255,'sharpness':100,'coverage':.5}});assert not pending['complete']
    preview=c.call('exam_deletion_preview',exam_id=multi);assert preview['scanned_pages']>=3 and preview['results']>=1
    c.call('delete_exam',{'exam_id':multi,'nonce':preview['nonce']});c.call('exam',id=multi,expected=404)
    with closing(sqlite3.connect(dbpath)) as db:assert not db.execute('PRAGMA foreign_key_check').fetchall()
    return True
