"""Cadastro, aprovação, edição e limpeza em SQLite descartável, sem tocar na escola."""
import http.cookiejar,json,os,pathlib,secrets,socket,sqlite3,subprocess,tempfile,time,urllib.request,urllib.error,urllib.parse
from contextlib import contextmanager
@contextmanager
def database(path):
    conn=sqlite3.connect(path)
    try:
        with conn:yield conn
    finally:conn.close()
ROOT=pathlib.Path(__file__).resolve().parents[1]
PHP=os.environ.get('PHP_BIN',r'C:\xampp\php\php.exe' if os.name=='nt' else 'php')
tmp=pathlib.Path(tempfile.mkdtemp(prefix='marioprovas-accounts-')).resolve()
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
BASE=f'http://127.0.0.1:{port}/';env=os.environ.copy();env.update(MARIOPROVAS_DB=str(tmp/'test.sqlite'),MARIOPROVAS_SETUP_KEY=secrets.token_hex(24),PYTHONIOENCODING='utf-8')
log=open(tmp/'server.log','wb');server=subprocess.Popen([PHP,'-S',f'127.0.0.1:{port}','-t',str(ROOT/'public'),str(ROOT/'scripts/dev-router.php')],cwd=ROOT,env=env,stdout=log,stderr=log)
class Client:
    def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=''
    def call(self,action,data=None,expected=200,csrf=True,**params):
        opts={'Content-Type':'application/json','X-CSRF-Token':self.csrf if csrf else ''} if data is not None else {}
        req=urllib.request.Request(BASE+'api.php?'+urllib.parse.urlencode({'action':action,**params}),data=json.dumps(data).encode() if data is not None else None,headers=opts)
        try:r=self.opener.open(req)
        except urllib.error.HTTPError as e:r=e
        content=r.read();assert r.status==expected,(action,r.status,content[:300]);out=json.loads(content)
        if expected!=200:return out
        data=out['data']
        if isinstance(data,dict) and data.get('csrf'):self.csrf=data['csrf']
        return data
    def login(self,email,password):self.call('state');return self.call('login',{'email':email,'password':password})
checks=[]
def check(value,label):assert value,label;checks.append(label);print('OK:',label,flush=True)
try:
    for _ in range(60):
        try:urllib.request.urlopen(BASE,timeout=1);break
        except OSError:time.sleep(.1)
    admin=Client();admin.call('state');password=secrets.token_urlsafe(20);email='admin@example.invalid'
    admin.call('setup',{'key':env['MARIOPROVAS_SETUP_KEY'],'school':'Escola descartável','name':'Administrador de teste','email':email,'password':password});actor=admin.login(email,password)['user'];sid=actor['school_id']
    public=Client();public.call('state');schools=public.call('registration_schools');assert schools==[{'id':sid,'name':'Escola descartável'}]
    profile={'school_id':sid,'name':'Docente de teste','email':'teacher@example.invalid','phone':'(11) 99999-0000','password':password,'knowledge_area':'Ciências da Natureza','discipline':'Biologia','shifts':['morning','evening']}
    public.call('register',profile,csrf=False,expected=403)
    for change in [{'shifts':[]},{'shifts':['invalid']},{'shifts':'morning'},{'phone':'123'},{'knowledge_area':''},{'discipline':''},{'password':'curta'},{'school_id':999999}]:public.call('register',{**profile,**change},expected=422)
    public.call('register',{**profile,'role':'admin','status':'active','is_operator':1})
    public.call('register',{**profile,'email':'TEACHER@EXAMPLE.INVALID'},expected=409)
    public.call('login',{'email':profile['email'],'password':password},expected=403);public.call('dashboard',expected=401)
    user=next(u for u in admin.call('team') if u['email']==profile['email']);assert user['status']=='pending' and user['role']=='teacher' and user['shifts']==['morning','evening']
    assert not any('password' in u or 'auth_version' in u for u in admin.call('team'))
    check(True,'cadastro completo exige turnos válidos, não eleva privilégio e não dá acesso antes da aprovação')
    review={'id':user['id'],'profile_revision':user['profile_revision'],'decision':'approve'};admin.call('team_review',review,csrf=False,expected=403);admin.call('team_review',review);admin.call('team_review',review,expected=409)
    teacher=Client();teacher.login(profile['email'],password);assert teacher.call('dashboard')['school']=='Escola descartável'
    for action,body in [('team',None),('team_create',profile),('team_update',{**user,'name':'Fraude'}),('team_review',review)]:teacher.call(action,body,expected=403)
    check(True,'aprovação explícita libera login; professores não gerenciam usuários nem autorizam a si mesmos')
    operator=admin.call('team_create',{**profile,'email':'operator@example.invalid','name':'Operador de teste','role':'operator'})
    op=Client();assert op.login('operator@example.invalid',password)['user']['role']=='operator'
    another={**profile,'email':'pending@example.invalid'};public.call('register',another);pending=next(u for u in op.call('team') if u['email']==another['email']);op.call('team_review',{'id':pending['id'],'profile_revision':pending['profile_revision'],'decision':'approve'})
    old=next(u for u in op.call('team') if u['id']==user['id']);new_password=secrets.token_urlsafe(20)
    with database(tmp/'test.sqlite') as db:old_hash=db.execute('SELECT password FROM users WHERE id=?',(old['id'],)).fetchone()[0]
    op.call('team_update',{**old,'name':'Docente atualizado','phone':'(11) 98888-7777','shifts':['afternoon','evening'],'password':''})
    with database(tmp/'test.sqlite') as db:assert db.execute('SELECT password FROM users WHERE id=?',(old['id'],)).fetchone()[0]==old_hash
    assert teacher.call('state')['user']['name']=='Docente atualizado'
    op.call('team_update',{**old,'name':'Conflito'},expected=409)
    edited=next(u for u in op.call('team') if u['id']==user['id']);op.call('team_update',{**edited,'password':new_password})
    teacher.call('dashboard',expected=401);teacher.login(profile['email'],new_password)
    op.call('team_update',{**next(u for u in op.call('team') if u['id']==user['id']),'role':'admin'},expected=403)
    op.call('team_update',{**actor,'name':'Indevido'},expected=403)
    op.call('team_create',{**profile,'email':'elevate@example.invalid','role':'operator'},expected=403)
    check(True,'operador aprova/edita professores; senha opcional preserva hash e troca de senha encerra sessões antigas')
    edited=next(u for u in op.call('team') if u['id']==user['id']);op.call('team_review',{'id':edited['id'],'profile_revision':edited['profile_revision'],'decision':'block'});teacher.call('dashboard',expected=401)
    teacher.call('login',{'email':profile['email'],'password':new_password},expected=403)
    edited=next(u for u in admin.call('team') if u['id']==user['id']);admin.call('team_review',{'id':edited['id'],'profile_revision':edited['profile_revision'],'decision':'approve'});teacher.login(profile['email'],new_password)
    admin.call('team_review',{'id':actor['id'],'profile_revision':actor['profile_revision'],'decision':'block'},expected=422)
    admin.call('team_update',{**actor,'role':'teacher'},expected=422)
    public.call('register',{**profile,'email':'reject@example.invalid'});rejected=next(u for u in admin.call('team') if u['email']=='reject@example.invalid');admin.call('team_review',{'id':rejected['id'],'profile_revision':rejected['profile_revision'],'decision':'reject'})
    public.call('login',{'email':'reject@example.invalid','password':password},expected=403)
    check(True,'suspensão, reativação e recusa funcionam; gestor não retira o próprio acesso administrativo')
    with database(tmp/'test.sqlite') as db:
        hashed=db.execute('SELECT password FROM users WHERE id=?',(actor['id'],)).fetchone()[0];other=db.execute("INSERT INTO schools(name) VALUES('Outra escola')").lastrowid
        other_id=db.execute("INSERT INTO users(school_id,name,email,password,role) VALUES(?,?,?,?,'admin')",(other,'Outro gestor','other@example.invalid',hashed)).lastrowid
    cross=Client();cross.login('other@example.invalid',password)
    cross.call('team_update',edited,expected=404);cross.call('team_review',review,expected=404);assert all(u['school_id']==other for u in cross.call('team'))
    check(True,'listagem, edição e aprovação isoladas por escola')
    browser_env=os.environ.copy();browser_env.update(MARIOPROVAS_TEST_URL=BASE,MARIOPROVAS_TEST_EMAIL=email,MARIOPROVAS_TEST_PASSWORD=password)
    subprocess.run(['node','tests/accounts-browser.mjs'],cwd=ROOT,env=browser_env,check=True,timeout=100)
    # Executa a mesma rotina de limpeza da entrega, apenas no banco descartável.
    with database(tmp/'test.sqlite') as db:
        db.execute('CREATE TABLE unexpected_data(id INTEGER)')
    blocked=subprocess.run([PHP,'scripts/reset-school-data.php','--execute',str(tmp/'blocked-backup.sqlite')],cwd=ROOT,env=env,capture_output=True,text=True)
    assert blocked.returncode!=0 and not (tmp/'blocked-backup.sqlite').exists()
    with database(tmp/'test.sqlite') as db:
        db.execute('DROP TABLE unexpected_data');cid=db.execute("INSERT INTO classes(school_id,name) VALUES(?,'Turma descartável')",(sid,)).lastrowid
        db.execute("INSERT INTO students(school_id,external_id,name,class_id) VALUES(?,'1','Aluno descartável',?)",(sid,cid))
        users_before=db.execute('SELECT id,name,email,password,role,status,phone,knowledge_area,discipline,shifts,is_operator,auth_version FROM users ORDER BY id').fetchall()
    reset=subprocess.run([PHP,'scripts/reset-school-data.php','--execute',str(tmp/'backup.sqlite')],cwd=ROOT,env=env,capture_output=True,text=True,check=True);summary=json.loads(reset.stdout)
    with database(tmp/'test.sqlite') as db:
        after=db.execute('SELECT id,name,email,password,role,status,phone,knowledge_area,discipline,shifts,is_operator,auth_version FROM users ORDER BY id').fetchall()
        assert [r[:-1] for r in after]==[r[:-1] for r in users_before] and all(a[-1]==b[-1]+1 for a,b in zip(after,users_before))
        assert db.execute('SELECT COUNT(*) FROM question_bank').fetchone()[0]==40 and not db.execute('PRAGMA foreign_key_check').fetchall()
        for table, in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
            if table not in ['users','schools','question_bank']:assert db.execute('SELECT COUNT(*) FROM "'+table+'"').fetchone()[0]==0,table
    with database(tmp/'backup.sqlite') as db:assert db.execute('SELECT COUNT(*) FROM students').fetchone()[0]==1
    admin.call('dashboard',expected=401);admin.login(email,password);assert admin.call('bank_list')['total']==20
    check(summary['users']==len(users_before),'limpeza real testada preserva contas/senhas/perfis, guarda backup, remove dados e deixa 20 questões por escola')
    print(f'Concluído: {len(checks)} grupos de verificações de contas/limpeza e navegador.',flush=True)
except Exception:
    log.flush();print((tmp/'server.log').read_text(errors='replace')[-2500:]);raise
finally:
    server.terminate();server.wait(timeout=10);log.close()
    if 'db' in globals():db.close()
    assert tmp.parent==pathlib.Path(tempfile.gettempdir()).resolve() and tmp.name.startswith('marioprovas-accounts-')
    for item in tmp.iterdir():
        if item.is_file():item.unlink()
    tmp.rmdir()
