"""Testa a API real com o CSV original. Base e sessão exclusivas e descartáveis.
Não exibe dados de estudantes. Não modifica o CSV nem a base da aplicação.
Execute primeiro npm run test:omr para gerar medições ópticas de teste.
"""
import csv, hashlib, http.cookiejar, io, json, os, pathlib, secrets, socket, sqlite3, subprocess, tempfile, time, urllib.request, urllib.error

ROOT=pathlib.Path(__file__).resolve().parents[1]
PHP=os.environ.get('PHP_BIN',r'C:\xampp\php\php.exe' if os.name=='nt' else 'php')
CSV=next(ROOT.glob('*.csv'),None)
if CSV:
    csv_content=CSV.read_bytes();original_hash=hashlib.sha256(csv_content).hexdigest()
else:
    # Se o original já não está na pasta, reutiliza somente os cadastros reais
    # da base local em modo leitura. O arquivo de teste permanece em memória.
    source=sqlite3.connect('file:'+str((ROOT/'storage/marioprovas.sqlite').resolve().as_posix())+'?mode=ro',uri=True)
    buffer=io.StringIO();writer=csv.writer(buffer,delimiter=';');writer.writerow(['id','Aluno: Nome','Turma: Nome'])
    writer.writerows(source.execute('SELECT s.external_id,s.name,c.name FROM students s JOIN classes c ON c.id=s.class_id ORDER BY s.id'))
    source.close();csv_content=buffer.getvalue().encode('cp1252')
    original_hash=None
temp=pathlib.Path(tempfile.mkdtemp(prefix='marioprovas-test-')).resolve()
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
BASE=f'http://127.0.0.1:{port}/'
env=os.environ.copy();env.update(MARIOPROVAS_DB=str(temp/'test.sqlite'),MARIOPROVAS_SETUP_KEY=secrets.token_hex(24))
log=open(temp/'server.log','wb')
server=subprocess.Popen([PHP,'-S',f'127.0.0.1:{port}','-t',str(ROOT/'public'),str(ROOT/'scripts/dev-router.php')],cwd=ROOT,env=env,stdout=log,stderr=log)
passed=[]
def check(condition,label):
    if not condition: raise AssertionError(label)
    passed.append(label);print('OK:',label)
class Client:
    def __init__(self):
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=''
    def call(self,action,data=None,params=None,expected=200,raw=False,multipart=None,csrf=True):
        query=urllib.parse.urlencode({'action':action,**(params or {})});headers={};payload=None
        if multipart is not None: payload,ct=multipart;headers['Content-Type']=ct
        elif data is not None: payload=json.dumps(data).encode();headers['Content-Type']='application/json'
        if payload is not None and csrf:headers['X-CSRF-Token']=self.csrf
        req=urllib.request.Request(BASE+'api.php?'+query,data=payload,headers=headers)
        try:response=self.opener.open(req)
        except urllib.error.HTTPError as e:response=e
        content=response.read();status=response.status
        if status!=expected: raise AssertionError(f'{action}: HTTP {status} em vez de {expected}; '+(json.loads(content).get('error','') if content.startswith(b'{') else 'resposta não JSON'))
        if raw:return content
        out=json.loads(content)
        if expected!=200:return out
        assert out['ok'];out=out['data']
        if isinstance(out,dict) and out.get('csrf'):self.csrf=out['csrf']
        return out
def multipart(content):
    boundary='MarioProvasBoundary'+secrets.token_hex(8)
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="estudantes.csv"\r\nContent-Type: text/csv\r\n\r\n').encode()+content+(f'\r\n--{boundary}--\r\n').encode()
    return body,'multipart/form-data; boundary='+boundary
try:
    for _ in range(60):
        try:urllib.request.urlopen(BASE,timeout=1);break
        except OSError:time.sleep(.1)
    c=Client();s=c.call('state');check(not s['installed'],'base de teste inicia sem contas')
    c.call('dashboard',expected=401)
    password=secrets.token_urlsafe(20);email='verificacao@example.invalid'
    c.call('setup',{'key':env['MARIOPROVAS_SETUP_KEY'],'name':'Verificação automatizada','school':'Ambiente isolado de testes','email':email,'password':password})
    c.call('setup',{'key':env['MARIOPROVAS_SETUP_KEY']},expected=409)
    c.call('login',{'email':email,'password':password},csrf=False,expected=403)
    c.call('login',{'email':email,'password':password})
    check(True,'instalação única, autenticação e proteção CSRF')
    # Confere o MIME dos módulos para evitar tela vazia no navegador.
    for path in ['assets/app.mjs','assets/scanner.mjs','assets/omr.mjs','assets/layout.mjs','assets/print.mjs']:
        response=urllib.request.urlopen(BASE+path)
        assert 'javascript' in response.headers['Content-Type'], 'Módulo servido com MIME incorreto'
    check(True,'módulos JavaScript servidos com MIME executável')
    upload=c.call('upload',multipart=multipart(csv_content));mapping=upload['suggested']
    check(mapping['external_id']=='0' and upload['headers'][int(mapping['name'])]=='Aluno: Nome' and upload['headers'][int(mapping['class_name'])]=='Turma: Nome' and mapping['social_name']=='','mapeamento das colunas reais e ausência de nome social')
    preview=c.call('preview',{'mapping':mapping})
    check(preview['counts']=={'ready':885,'invalid':0,'duplicate':0},'prévia do CSV real: 885 prontos, sem duplicidades')
    dash=c.call('dashboard');check(dash['student_count']==0,'prévia não grava estudantes')
    imported=c.call('import',{'nonce':preview['nonce']});dash=c.call('dashboard')
    check(imported['imported']==885 and dash['student_count']==885 and len(dash['classes'])==27,'importação persistente dos 885 estudantes e 27 turmas')
    ui_env=os.environ.copy();ui_env.update(MARIOPROVAS_TEST_URL=BASE,MARIOPROVAS_TEST_EMAIL=email,MARIOPROVAS_TEST_PASSWORD=password)
    subprocess.run(['node','tests/ui.mjs'],cwd=ROOT,env=ui_env,check=True,timeout=45)
    c.call('upload',multipart=multipart(csv_content));p=c.call('preview',{'mapping':mapping})
    check(p['counts']['duplicate']==885 and p['counts']['ready']==0,'reimportação reconhece todos os identificadores existentes')
    out=c.call('import',{'nonce':p['nonce']});check(out['imported']==0 and c.call('dashboard')['student_count']==885,'reimportação idempotente')
    # Só recorta dados já existentes; não inventa cadastros para testes de validação.
    real=list(csv.reader(io.StringIO(csv_content.decode('cp1252')),delimiter=';'))
    buf=io.StringIO();wr=csv.writer(buf,delimiter=';');wr.writerow(['identificador','estudante','grupo']);wr.writerow([real[1][0],real[1][1],real[1][-1]]);wr.writerow(['',real[2][1],real[2][-1]]);wr.writerow([real[3][0],real[3][1]])
    c.call('upload',multipart=multipart(buf.getvalue().encode()));p=c.call('preview',{'mapping':{'external_id':'0','name':'1','class_name':'2','social_name':''}})
    check(p['counts']=={'ready':0,'invalid':2,'duplicate':1},'mapeamento alternativo, identificador ausente e linha malformada')
    ss=c.call('students');cid=ss[0]['class_id'];members=[x for x in ss if x['class_id']==cid];sid=members[0]['id']
    c.call('create_exam',{'class_id':cid,'name':'Teste','date':'2026-02-30','areas':[]},expected=422)
    create={'class_id':cid,'name':'VERIFICAÇÃO AUTOMÁTICA (base isolada)','date':'2026-11-10','alternatives':5,'areas':[{'name':'Linguagens','count':17,'answers':['A']*17},{'name':'Matemática','count':53,'answers':['A']*53},{'name':'Ciências da Natureza','count':1,'answers':['A']}],'students':[x['id'] for x in members]}
    eid=c.call('create_exam',create)['id'];e=c.call('exam',params={'id':eid})
    check([a['count'] for a in e['areas']]==[17,53,1] and len(e['questions'])==71,'simulado de três áreas com quantidades distintas e gabarito persistido')
    c.call('generate_cards',{'exam_id':eid,'count':2,'reusable':False});cards=c.call('cards',params={'exam_id':eid})['cards'];first=cards[0];second=cards[1]
    check(len(cards)==4 and first['question_count']==60 and second['question_count']==11 and all(len(x['token'])==32 for x in cards),'cartões multipágina com tokens aleatórios exclusivos')
    print_env=ui_env.copy();print_env.update(MARIOPROVAS_TEST_EXAM=str(eid),MARIOPROVAS_TEST_SET=str(first['booklet_id']))
    subprocess.run(['node','tests/print-browser.mjs'],cwd=ROOT,env=print_env,check=True,timeout=90)
    other=c.call('create_exam',{**create,'name':'OUTRA AVALIAÇÃO DE TESTE','areas':[{'name':'Disciplina única','count':1,'answers':['B']}]})['id']
    check(len(c.call('exam',params={'id':other})['areas'])==1,'prova de uma única disciplina')
    c.call('identify',params={'exam_id':eid,'token':'f'*32},expected=404)
    c.call('identify',params={'exam_id':other,'token':first['token']},expected=409)
    check(True,'QR desconhecido e QR de outro simulado rejeitados')
    evidence=json.loads((ROOT/'tests/artifacts/evidence.json').read_text())
    scan={'exam_id':eid,'token':first['token'],'student_id':sid,**evidence}
    c.call('scan',{**scan,'quality':{**evidence['quality'],'sharpness':0}},expected=422)
    c.call('scan',{**scan,'scores':[[.3,0,0,0,0]]*60},expected=422)
    c.call('scan',{**scan,'scores':[[1,0,0,0,0]]},expected=422)
    check(c.call('identify',params={'exam_id':eid,'token':first['token']})['scanned_at'] is None,'qualidade baixa, marca ambígua e contagem errada deixam cartão pendente')
    out=c.call('scan',scan);check(not out['complete'] and out['pending']==1 and not c.call('report',params={'id':eid})['students'],'primeira folha salva sem produzir resultado incompleto')
    c.call('scan',scan,expected=409);c.call('identify',params={'exam_id':eid,'token':first['token']},expected=409)
    check(True,'cartão já processado não duplica leitura')
    c.call('scan',{**scan,'token':second['token'],'student_id':members[1]['id'],'scores':[[0]*5]*11},expected=409)
    out=c.call('scan',{**scan,'token':second['token'],'scores':[[0]*5]*11})
    check(out['complete'] and out['correct']==11 and out['valid']==71 and out['annulled']==0 and out['incorrect']==60 and out['percentage']==15.49,'correção com evidência óptica: 11 acertos, 71 válidas, 60 erros, nenhuma anulação automática')
    c.call('scan',{**scan,'token':cards[2]['token']},expected=409)
    check(True,'mesmo estudante não recebe dois resultados nem dois conjuntos')
    report=c.call('report',params={'id':eid});individual=c.call('individual',params={'id':out['result_id']})
    check(len(report['students'])==1 and len(report['areas'])==3 and len(report['questions'])==71 and len(individual['responses'])==71,'relatórios por estudante, área e questão calculados de respostas persistidas')
    check(sum(q['blank'] for q in report['questions'])==12 and sum(q['multiple'] for q in report['questions'])==1,'relatório separa respostas em branco de marcações múltiplas')
    exported=c.call('export',params={'id':eid},raw=True);csv_rows=list(csv.reader(io.StringIO(exported.decode('utf-8-sig')),delimiter=';'))
    check(len(csv_rows)==5 and len(csv_rows[0])==15,'exportação UTF-8/Excel com escola, turma, estudante, áreas e total')
    # Mesma avaliação para duas turmas, mesmo QR e tentativas independentes.
    cid2=next(s['class_id'] for s in ss if s['class_id']!=cid)
    sid2=next(s['id'] for s in ss if s['class_id']==cid2)
    cid3=next(s['class_id'] for s in ss if s['class_id'] not in [cid,cid2])
    multi=c.call('create_exam',{**create,'name':'VERIFICAÇÃO MULTITURMAS','class_ids':[cid,cid2],'students':[sid,sid2]})['id']
    detail=c.call('exam',params={'id':multi})
    check(set(detail['class_ids'])=={cid,cid2} and len(detail['students'])==2,'um simulado associa várias turmas e preserva a turma de cada participante')
    c.call('create_exam',{**create,'class_ids':[cid],'students':[sid2]},expected=422)
    model=c.call('generate_cards',{'exam_id':multi})
    same_model=c.call('generate_cards',{'exam_id':multi})
    reusable=c.call('cards',params={'exam_id':multi})['cards'];p1,p2=reusable
    check(model['booklets']==same_model['booklets'] and len(reusable)==2 and p1['reusable']==1,'modelo reutilizável único pode ser reaberto sem gerar novos QR codes')
    common={'exam_id':multi,'quality':evidence['quality']}
    c.call('scan',{**common,'token':p1['token'],'student_id':sid,'scores':evidence['scores']})
    c.call('scan',{**common,'token':p1['token'],'student_id':sid,'scores':evidence['scores']},expected=409)
    c.call('scan',{**common,'token':p1['token'],'student_id':sid2,'scores':[[0,1,0,0,0]]*60})
    check(c.call('identify',params={'exam_id':multi,'token':p1['token']})['scanned_at'] is None and len(c.call('report',params={'id':multi})['students'])==0,'mesmo QR aceita dois estudantes, mantém páginas pendentes e rejeita repetição para o mesmo aluno')
    result2=c.call('scan',{**common,'token':p2['token'],'student_id':sid2,'scores':[[1,0,0,0,0]]*11})
    result1=c.call('scan',{**common,'token':p2['token'],'student_id':sid,'scores':[[0]*5]*11})
    check(result1['correct']==11 and result1['valid']==71 and result1['annulled']==0 and result2['correct']==11 and result2['valid']==71 and result2['annulled']==0 and result1['booklet_id']!=result2['booklet_id'],'páginas intercaladas do mesmo modelo mantêm respostas, anuladas e resultados independentes')
    c.call('scan',{**common,'token':p2['token'],'student_id':sid,'scores':[[0]*5]*11},expected=409)
    model_detail=c.call('exam',params={'id':multi})
    check(len(model_detail['booklets'])==1 and model_detail['booklets'][0]['uses']==2 and model_detail['booklets'][0]['completed']==2 and len(c.call('cards',params={'exam_id':multi})['cards'])==2,'impressão expõe apenas páginas do modelo; tentativas pessoais ficam separadas')
    multi_report=c.call('report',params={'id':multi})
    multi_csv=list(csv.reader(io.StringIO(c.call('export',params={'id':multi},raw=True).decode('utf-8-sig')),delimiter=';'))
    expected_class_names={x['name'] for x in detail['classes']}
    check(len(multi_report['students'])==2 and len(multi_report['classes'])==2 and {x[2] for x in multi_csv[1:]}==expected_class_names and sum(x['total'] for x in multi_report['classes'])==2,'relatório compara as turmas e CSV exporta a turma individual de cada estudante')
    from assessment import verify
    verify(c,check,temp/'test.sqlite',multi,cid,cid2,cid3,sid,sid2)
    c.call('class_update',{'id':cid,'grade_name':'SÉRIE DE VERIFICAÇÃO ISOLADA'})
    c.call('class_update',{'id':cid2,'grade_name':'SÉRIE DE VERIFICAÇÃO ISOLADA'})
    grade_exam=c.call('create_exam',{**create,'scope':'grade','grade_name':'SÉRIE DE VERIFICAÇÃO ISOLADA','students':[sid]})['id']
    grade_detail=c.call('exam',params={'id':grade_exam})
    check(set(grade_detail['class_ids'])=={cid,cid2} and len(grade_detail['students'])==sum(1 for s in ss if s['class_id'] in [cid,cid2]),'seleção de série inclui todas as turmas e todos os estudantes, validada pelo servidor')
    # Mapeia a coluna real de escolaridade quando fornecida; reimportação só
    # preenche séries vazias, sem alterar ou duplicar estudantes existentes.
    group=next(s for s in ss if s['class_id']==cid3)
    buf=io.StringIO();wr=csv.writer(buf,delimiter=';');wr.writerow(['id','Aluno: Nome','Turma: Nome','Ano de escolaridade: Nome']);wr.writerow([group['external_id'],group['name'],group['class_name'],'SÉRIE DE VERIFICAÇÃO DA IMPORTAÇÃO'])
    up=c.call('upload',multipart=multipart(buf.getvalue().encode('utf-8')))
    check(up['suggested']['grade_name']=='3','importador reconhece a coluna de ano de escolaridade como série')
    gp=c.call('preview',{'mapping':up['suggested']});out=c.call('import',{'nonce':gp['nonce']})
    check(gp['grade_updates']==1 and out['imported']==0 and out['grades_updated']==1 and c.call('dashboard')['student_count']==885,'prévia e confirmação permitem completar séries sem duplicar estudantes já importados')
    original=next(s for s in ss if s['id']==sid)
    c.call('student_update',{'id':sid,'name':original['name'],'social_name':original['social_name'],'class_id':cid3})
    after_move=c.call('report',params={'id':multi})
    check(next(s for s in after_move['students'] if s['student_id']==sid)['class_id']==cid,'mudança posterior de turma preserva a turma de participação no relatório histórico')
    c.call('student_update',{'id':sid,'name':original['name'],'social_name':original['social_name'],'class_id':cid})
    # Todos os dados da escola A devem ser invisíveis à conta da escola B.
    conn=sqlite3.connect(temp/'test.sqlite');hashed=conn.execute('SELECT password FROM users LIMIT 1').fetchone()[0];conn.execute('INSERT INTO schools(name) VALUES(?)',('Segunda escola de verificação',));schoolB=conn.execute('SELECT last_insert_rowid()').fetchone()[0];conn.execute('INSERT INTO users(school_id,name,email,password,role) VALUES(?,?,?,?,?)',(schoolB,'Verificação B','b@example.invalid',hashed,'teacher'));conn.commit();conn.close()
    b=Client();b.call('state');b.call('login',{'email':'b@example.invalid','password':password});b.call('exam',params={'id':eid},expected=404);b.call('report',params={'id':eid},expected=404);b.call('individual',params={'id':result1['result_id']},expected=404);b.call('export',params={'id':eid},expected=404);b.call('scan',scan,expected=404);b.call('team',expected=403);b.call('student_update',{'id':sid},expected=404)
    b.call('class_update',{'id':cid,'grade_name':'x'},expected=404)
    b.call('create_exam',{**create,'class_ids':[cid,cid2]},expected=422)
    b.call('identify',params={'exam_id':multi,'token':p1['token']},expected=404)
    b.call('update_key',{'exam_id':multi,'revision':1,'questions':[]},expected=404)
    b.call('update_grading',{'exam_id':multi,'revision':1,'grading_policy':None},expected=404)
    check(not b.call('students') and not b.call('dashboard')['exams'],'isolamento entre escolas em estudantes, avaliações, leitura, relatórios e exportação')
    # Arquivos privados nem estão sob o document root usado no teste.
    for path in ['../ID_EEEM_MARIO__29311.csv','storage/marioprovas.sqlite','app/schema.sql','config.php']:
        try:urllib.request.urlopen(BASE+path);raise AssertionError('Arquivo privado exposto')
        except urllib.error.HTTPError as error:assert error.code==404
    check(True,'document root público não expõe CSV, configuração nem banco')
    # Sessão opcional para iterar QA de interface no mesmo banco descartável.
    # O arquivo contém somente credenciais efêmeras desta base de teste.
    qa_session=os.environ.get('MARIOPROVAS_QA_SESSION')
    if qa_session:
        qa_path=pathlib.Path(qa_session).resolve()
        assert qa_path.parent==pathlib.Path(tempfile.gettempdir()).resolve() and qa_path.name.startswith('marioprovas-qa-')
        qa_path.write_text(json.dumps({k:v for k,v in print_env.items() if k.startswith('MARIOPROVAS_TEST_')}),encoding='utf-8')
        print('QA isolado disponível; remova o arquivo de sessão temporária para concluir.')
        while qa_path.exists():time.sleep(.5)
    if os.environ.get('MARIOPROVAS_RESPONSIVE')=='1':
        subprocess.run(['node','tests/responsive-browser.mjs'],cwd=ROOT,env=print_env,check=True,timeout=360)
    c.call('logout',{});c.call('dashboard',expected=401)
    check(CSV is None or hashlib.sha256(CSV.read_bytes()).hexdigest()==original_hash,'fonte escolar preservada; testes exclusivamente em banco isolado')
    print(f'Concluído: {len(passed)} verificações de integração. Nenhum dado gravado na base da aplicação.')
finally:
    server.terminate();server.wait(timeout=10);log.close()
    # Arquivos pertencentes exclusivamente a este teste, sem remoção recursiva.
    assert temp.parent==pathlib.Path(tempfile.gettempdir()).resolve() and temp.name.startswith('marioprovas-test-')
    for item in temp.iterdir():
        if item.is_file():item.unlink()
    temp.rmdir()
