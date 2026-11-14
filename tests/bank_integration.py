"""Banco, versões, PDFs e correção via API real, somente em SQLite temporário.
Execute: python tests/bank_integration.py. Nenhum dado da escola é alterado.
"""
import copy, hashlib, http.cookiejar, json, os, pathlib, secrets, socket, sqlite3, struct, subprocess, tempfile, time, urllib.request, urllib.error, urllib.parse, zlib
import pymupdf

ROOT=pathlib.Path(__file__).resolve().parents[1]
PHP=os.environ.get('PHP_BIN',r'C:\xampp\php\php.exe' if os.name=='nt' else 'php')
ART=ROOT/'tests/artifacts';ART.mkdir(exist_ok=True)
tmp=pathlib.Path(tempfile.mkdtemp(prefix='marioprovas-bank-')).resolve()
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
BASE=f'http://127.0.0.1:{port}/'
env=os.environ.copy();env.update(MARIOPROVAS_DB=str(tmp/'test.sqlite'),MARIOPROVAS_SETUP_KEY=secrets.token_hex(24),PYTHONIOENCODING='utf-8')
log=open(tmp/'server.log','wb')
server=subprocess.Popen([PHP,'-S',f'127.0.0.1:{port}','-t',str(ROOT/'public'),str(ROOT/'scripts/dev-router.php')],cwd=ROOT,env=env,stdout=log,stderr=log)
checks=[]
def check(value,label):
    assert value,label
    checks.append(label);print('OK:',label,flush=True)
class Client:
    def __init__(self):self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.csrf=''
    def call(self,action,data=None,expected=200,raw=False,csrf=True,multipart=None,**params):
        headers={};payload=None
        if multipart is not None:
            content,mime=multipart;boundary='MarioProvas'+secrets.token_hex(8)
            payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="imagem"\r\nContent-Type: {mime}\r\n\r\n').encode()+content+(f'\r\n--{boundary}--\r\n').encode();headers['Content-Type']='multipart/form-data; boundary='+boundary
            if csrf:headers['X-CSRF-Token']=self.csrf
        elif data is not None:
            payload=json.dumps(data).encode();headers['Content-Type']='application/json'
            if csrf:headers['X-CSRF-Token']=self.csrf
        req=urllib.request.Request(BASE+'api.php?'+urllib.parse.urlencode({'action':action,**params}),data=payload,headers=headers)
        try:r=self.opener.open(req)
        except urllib.error.HTTPError as e:r=e
        content=r.read();assert r.status==expected,(action,r.status,content[:300])
        if raw:return content
        obj=json.loads(content)
        if expected!=200:return obj
        out=obj['data']
        if isinstance(out,dict) and out.get('csrf'):self.csrf=out['csrf']
        return out
def prepared(c,ids,classes,**extra):
    return c.call('prepare_bank_exam',{'name':'Prova de integração: funções e interpretação','date':'2026-11-13','duration':90,'question_count':len(ids),'class_ids':classes,'alternatives':5,'versions':3,'selected':[{'id':i,'fixed_position':j==0,'fixed_options':[0,4] if j==0 else []} for j,i in enumerate(ids)],**extra})
def finalize(c,draft):return c.call('finalize_bank_exam',{'nonce':draft['nonce']})['id']
def detail(c,eid):return c.call('exam',id=eid)
quality={'markerCount':4,'contrast':255,'sharpness':100,'coverage':.5}
def scan(c,eid,card,sid,marks):
    return c.call('scan',{'exam_id':eid,'token':card['token'],'student_id':sid,'scores':[[1 if chr(65+i) in m else 0 for i in range(5)] for m in marks],'quality':quality})
try:
    for _ in range(60):
        try:urllib.request.urlopen(BASE,timeout=1);break
        except OSError:time.sleep(.1)
    c=Client();c.call('state');password=secrets.token_urlsafe(20);email='bank@example.invalid'
    c.call('setup',{'key':env['MARIOPROVAS_SETUP_KEY'],'school':'Teste descartável','name':'Teste','email':email,'password':password});c.call('login',{'email':email,'password':password})
    with sqlite3.connect(tmp/'test.sqlite') as db:
        school,uid=db.execute('SELECT school_id,id FROM users').fetchone()
        classes=[db.execute('INSERT INTO classes(school_id,name) VALUES(?,?)',(school,n)).lastrowid for n in ['Turma teste A','Turma teste B']]
        students=[db.execute('INSERT INTO students(school_id,external_id,name,class_id) VALUES(?,?,?,?)',(school,str(i),f'Estudante fictício {i}',classes[i%2])).lastrowid for i in range(8)]
    db.close()
    # Imagem raster real: gráfico simples, exclusivamente como fixture de teste.
    def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    pixels=bytearray()
    for y in range(240):
        pixels.append(0)
        for x in range(600):
            color=(255,255,255)
            if x in range(35,39) or y in range(209,213) and 35<=x<=565:color=(25,45,35)
            for left,height,cvalue in [(100,70,(60,125,95)),(260,120,(80,130,190)),(420,170,(205,145,55))]:
                if left<=x<left+70 and 210-height<=y<210:color=cvalue
            pixels.extend((*color,0 if color==(255,255,255) else 255))
    png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',600,240,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b'')
    (ART/'question-diagram.png').write_bytes(png)
    image=c.call('question_image_upload',multipart=(png,'image/png'))
    check(c.call('question_image',id=image['id'],raw=True)==png,'upload e consulta autenticada de imagem PNG')
    flat=pymupdf.open();fp=flat.new_page(width=600,height=240);fp.insert_image(fp.rect,stream=png);jpeg=fp.get_pixmap(alpha=False).tobytes('jpeg');flat.close();imageJpeg=c.call('question_image_upload',multipart=(jpeg,'image/jpeg'))
    check(c.call('question_image',id=imageJpeg['id'],raw=True)==jpeg,'upload e consulta autenticada de imagem JPEG')
    c.call('question_image_upload',multipart=(png,'image/png'),csrf=False,expected=403)
    c.call('question_image_upload',multipart=(b'<svg/>','image/svg+xml'),expected=422)
    c.call('question_image_upload',multipart=(b'JPEG invalido','image/jpeg'),expected=422)
    base={'statement':'Leia a situação e escolha a resposta correta.\nQual é o valor de 2² + 3?','options':['Sete','Cinco','Nove','Onze','Treze'],'answer':'A','discipline':'Matemática','area':'Ciências exatas','subject':'Potências','difficulty':'medium'}
    qs=[c.call('bank_save',{**base,'statement':f'Questão de teste {i+1}. '+base['statement'],'answer':chr(65+i%5),'discipline':'Matemática' if i%2 else 'Português','image_id':image['id'] if i==0 else imageJpeg['id'] if i==1 else None}) for i in range(8)]
    ids=[q['id'] for q in qs]
    check(c.call('bank_list',search='SITUAÇÃO')['total']==8 and c.call('bank_list',discipline='Matemática')['total']==4 and c.call('bank_list',difficulty='hard')['total']==0,'cadastro, busca com acentos e filtros reais')
    c.call('bank_save',base,csrf=False,expected=403);c.call('bank_save',{**base,'answer':'Z'},expected=422);c.call('bank_save',{**base,'options':['Só uma']},expected=422)
    c.call('bank_save',{**qs[0],'revision':0},expected=409)
    fixed={'name':'Todas fixas','date':'2026-11-13','duration':30,'question_count':1,'class_ids':classes,'alternatives':5,'versions':2,'selected':[{'id':ids[0],'fixed_position':True,'fixed_options':[0,1,2,3,4]}]}
    c.call('prepare_bank_exam',fixed,expected=422)
    check(True,'restrições que impedem versões distintas são rejeitadas sem criar prova')
    draft=prepared(c,ids,classes,pdf_columns=2)
    check(not c.call('dashboard')['exams'],'prévia não cria prova, cartões ou resultados')
    for plan in draft['draft']['versions'].values():
        assert plan[0]['index']==0 and plan[0]['choice_order'][0]==0 and plan[0]['choice_order'][4]==4
        assert sorted(p['index'] for p in plan)==list(range(8))
        assert all(sorted(p['choice_order'])==list(range(5)) for p in plan)
    c.call('finalize_bank_exam',{'nonce':'errado'},expected=409)
    eid=finalize(c,draft);e=detail(c,eid)
    check(len(e['versions'])==3 and len(e['booklets'])==3 and e['duration']==90 and e['pdf_columns']==2,'finalização persiste versões A/B/C, cartões e escolha de duas colunas')
    c.call('finalize_bank_exam',{'nonce':draft['nonce']},expected=409)
    versions=[c.call('version_content',exam_id=eid,version_id=v['id']) for v in e['versions']]
    check(all(v['questions'][0]['original_number']==1 and v['questions'][0]['choice_order'][0]==0 and v['questions'][0]['choice_order'][4]==4 for v in versions),'questão e alternativas fixas sobrevivem à gravação')
    check(all(v['questions']==[{**q} for q in c.call('version_content',exam_id=eid,version_id=v['id'])['questions']] for v in versions),'reabrir versão conserva exatamente ordem, conteúdo e gabarito')
    before=copy.deepcopy(versions);c.call('bank_save',{**qs[0],'statement':'QUESTÃO EDITADA DEPOIS DA APLICAÇÃO','options':['Mudou']*5,'answer':'D','image_id':None})
    check(before==[c.call('version_content',exam_id=eid,version_id=v['id']) for v in e['versions']],'editar banco não muda prova finalizada, alternativas ou gabaritos')
    check(all(v['questions'][0]['image_id']==image['id'] for v in versions) and c.call('bank_question',id=ids[0])['image_id'] is None,'remover imagem do banco preserva a imagem da prova e de todas as versões')
    cards=c.call('cards',exam_id=eid)['cards'];lookup={v['id']:v for v in versions}
    results=[]
    for i,card in enumerate(cards):
        v=lookup[card['version_id']];identity=c.call('identify',exam_id=eid,token=card['token']);assert identity['version_label']==v['label']
        marks=[[q['answer']] for q in v['questions']]
        if i==2:marks[2]=[];marks[3]=['A','B']
        r=scan(c,eid,card,students[i],marks);results.append(r)
        assert r['correct']==(6 if i==2 else 8)
        ind=c.call('individual',id=r['result_id'])
        assert ind['version_label']==v['label'] and [q['number'] for q in ind['responses']]==list(range(1,9))
        assert [q['answer'] for q in ind['responses']]==[q['answer'] for q in v['questions']]
        assert [q['marked'] for q in ind['responses']]==[','.join(m) for m in marks]
    check(True,'A, B e C corrigidas pelo próprio mapa; individual mostra letras e posições impressas')
    rep=c.call('report',id=eid)
    check(rep['students'][2]['blank']>=0 and len(rep['disciplines'])==2 and sum(d['correct'] for d in rep['disciplines'])==22,'relatórios por aluno, turma, disciplina, brancos e múltiplas')
    check(len(c.call('report',id=eid,class_id=classes[1])['students'])==1,'resultados das versões respeitam filtro de turma')
    csv=c.call('export',id=eid,raw=True).decode('utf-8-sig');check('Versão' in csv and 'Em branco' in csv,'exportação identifica versão e brancos')
    # Gabarito A usado como se fosse B não pode produzir resultado integral.
    vb=versions[1];va=versions[0]
    if [q['answer'] for q in va['questions']]==[q['answer'] for q in vb['questions']]:
        c.call('add_versions',{'exam_id':eid,'count':1});v=detail(c,eid)['versions'][-1];vb=c.call('version_content',exam_id=eid,version_id=v['id'])
    if [q['answer'] for q in va['questions']]!=[q['answer'] for q in vb['questions']]:
        bcard=next(card for card in c.call('cards',exam_id=eid)['cards'] if card['version_id']==vb['id'])
        r=scan(c,eid,bcard,students[3],[[q['answer']] for q in va['questions']]);assert r['correct']<8
    check(True,'respostas com letras de outra versão não recebem correção indevida')
    # Recalcular sem alterações preserva a correção das três versões.
    c.call('update_grading',{'exam_id':eid,'revision':e['revision'],'grading_policy':{'scope':'total','rules':[{'metric':'correct','bands':[{'min':0,'max':8,'points':10}]}]}})
    check(all(c.call('individual',id=r['result_id'])['correct']==r['correct'] for r in results),'recálculo de notas preserva resultados de todas as versões')
    e=detail(c,eid);c.call('update_key',{'exam_id':eid,'revision':e['revision'],'questions':[{'id':q['id'],'answer':q['answer'],'annulled':q['number']==2} for q in e['questions']]})
    check(all(c.call('individual',id=r['result_id'])['credited']==1 for r in results),'anulação por identidade atinge a posição certa em todas as versões')
    saved_versions=[c.call('version_content',exam_id=eid,version_id=v['id']) for v in detail(c,eid)['versions']]
    c.call('add_versions',{'exam_id':eid,'count':2})
    check(len(detail(c,eid)['versions'])==len(saved_versions)+2 and saved_versions==[c.call('version_content',exam_id=eid,version_id=v['id']) for v in saved_versions],'novas versões sem modificar versões anteriores')
    for columns in [1,2]:
        pdf=c.call('exam_pdf',exam_id=eid,version_id=e['versions'][1]['id'],columns=columns,raw=True);assert pdf.startswith(b'%PDF-');(ART/f'bank-prova-{columns}-colunas.pdf').write_bytes(pdf)
    pdf=c.call('exam_pdf',exam_id=eid,key=1,raw=True);assert pdf.startswith(b'%PDF-');(ART/'bank-gabaritos.pdf').write_bytes(pdf)
    (ART/'bank-todas-versoes.pdf').write_bytes(c.call('exam_pdf',exam_id=eid,raw=True))
    check(True,'downloads reais de PDF em uma e duas colunas e gabaritos separados')
    # Capa importada, configuração persistida e variantes de diagramação.
    cover_doc=pymupdf.open();cp=cover_doc.new_page(width=595.276,height=841.89)
    cp.draw_rect(pymupdf.Rect(15,15,580,827),color=(.1,.4,.25),width=2)
    cp.insert_text((45,60),'CAPA PERSONALIZADA DE TESTE',fontsize=18,color=(.1,.4,.25))
    cp.insert_text((45,790),'Rodape do modelo enviado',fontsize=12)
    cp.draw_rect(pymupdf.Rect(260,395,335,445),fill=(1,0,0),color=(1,0,0))
    cover_bytes=cover_doc.tobytes();(ART/'cover-template.pdf').write_bytes(cover_bytes)
    (ART/'cover-template-modern.pdf').write_bytes(cover_doc.tobytes(use_objstms=1,deflate=True))
    cv=c.call('exam_cover_upload',multipart=(cover_bytes,'application/pdf'))
    assert c.call('exam_cover',id=cv['id'],raw=True)==cover_bytes
    c.call('exam_cover_upload',multipart=(cover_bytes,'application/pdf'),csrf=False,expected=403)
    c.call('exam_cover_upload',multipart=(b'<html>no</html>','application/pdf'),expected=422)
    c.call('exam_cover_upload',multipart=(b'%PDF-invalid','application/pdf'),expected=422)
    cover_doc.new_page();c.call('exam_cover_upload',multipart=(cover_doc.tobytes(),'application/pdf'),expected=422)
    c.call('exam_cover_upload',multipart=(b'%PDF-'+b'X'*(4*1024*1024),'application/pdf'),expected=413)
    current=detail(c,eid);unchanged=[c.call('version_content',exam_id=eid,version_id=v['id']) for v in current['versions']]
    config={'exam_id':eid,'pdf_revision':current['pdf_revision'],'pdf_columns':2,'pdf_group_images':True,'cover_id':cv['id']}
    saved=c.call('save_pdf_settings',config);assert saved['pdf_revision']==current['pdf_revision']+1
    c.call('save_pdf_settings',config,expected=409);c.call('save_pdf_settings',config,csrf=False,expected=403)
    assert detail(c,eid)['cover_id']==cv['id']
    (ART/'bank-custom-cover.pdf').write_bytes(c.call('exam_pdf',exam_id=eid,version_id=e['versions'][1]['id'],raw=True))
    (ART/'bank-custom-all.pdf').write_bytes(c.call('exam_pdf',exam_id=eid,raw=True))
    (ART/'bank-custom-preview.pdf').write_bytes(c.call('exam_pdf',exam_id=eid,version_id=e['versions'][1]['id'],cover_only=1,raw=True))
    (ART/'bank-ungrouped.pdf').write_bytes(c.call('exam_pdf',exam_id=eid,version_id=e['versions'][1]['id'],group_images=0,cover='none',raw=True))
    c.call('exam_pdf',exam_id=eid,group_images='bad',expected=422)
    (ART/'bank-layout-expected.json').write_text(json.dumps(c.call('version_content',exam_id=eid,version_id=e['versions'][1]['id'])['questions']),encoding='utf-8')
    c.call('save_pdf_settings',{**config,'pdf_revision':saved['pdf_revision'],'cover_id':None})
    assert unchanged==[c.call('version_content',exam_id=eid,version_id=v['id']) for v in current['versions']]
    # Duas questões com imagem consecutivas compartilham a página de largura inteira.
    iq=c.call('bank_save',{**base,'statement':'Outra imagem para conferir economia de folhas.','image_id':image['id']})
    image_exam=finalize(c,prepared(c,[ids[1],iq['id']],classes,versions=1,pdf_columns=2,cover_id=cv['id'],pdf_group_images=True))
    assert detail(c,image_exam)['cover_id']==cv['id']
    (ART/'bank-images-only.pdf').write_bytes(c.call('exam_pdf',exam_id=image_exam,raw=True))
    check(True,'capa PDF privada, envio válido/inválido, criação, troca/remoção, prévia, persistência e concorrência sem alterar versões')

    # Seleção automática, insuficiência e validação do tamanho uniforme.
    auto=prepared(c,ids[:3],classes,mode='automatic',filters={'discipline':'Matemática','difficulty':'medium'})
    check(len(auto['draft']['questions'])==3 and all(q['discipline']=='Matemática' for q in auto['draft']['questions']),'seleção automática respeita disciplina, dificuldade e quantidade')
    c.call('prepare_bank_exam',{**auto['draft'],'mode':'automatic','question_count':240,'filters':{'discipline':'Matemática'}},expected=422)
    bad={'name':'x','date':'2026-11-13','duration':60,'question_count':2,'class_ids':classes,'selected':[{'id':ids[1]},{'id':ids[1]}]}
    c.call('prepare_bank_exam',bad,expected=422)
    # 61 questões, duas versões: páginas de modelos diferentes nunca se misturam.
    more=[c.call('bank_save',{**base,'statement':f'Multipágina {i}. '+('Considere as informações do enunciado e avalie cada alternativa. '*80 if i==0 else '2 + 2 = ?')})['id'] for i in range(61)]
    multi=finalize(c,prepared(c,more,classes,versions=2));mc=c.call('cards',exam_id=multi)['cards'];me=detail(c,multi)
    mv={v['id']:c.call('version_content',exam_id=multi,version_id=v['id']) for v in me['versions']}
    r=scan(c,multi,mc[0],students[0],[[q['answer']] for q in mv[mc[0]['version_id']]['questions'][:60]]);assert not r['complete']
    c.call('scan',{'exam_id':multi,'token':mc[3]['token'],'student_id':students[0],'scores':[[1,0,0,0,0]],'quality':quality},expected=409)
    r=scan(c,multi,mc[1],students[0],[[mv[mc[1]['version_id']]['questions'][60]['answer']]])
    check(r['complete'] and r['correct']==61,'multipágina retoma a mesma versão e rejeita mistura entre A e B')
    c.call('scan',{'exam_id':multi,'token':mc[0]['token'],'student_id':students[0],'scores':[[1,0,0,0,0]]*60,'quality':quality},expected=409)
    (ART/'bank-multipagina-2-colunas.pdf').write_bytes(c.call('exam_pdf',exam_id=multi,version_id=me['versions'][0]['id'],columns=2,raw=True))
    # Identificação óptica: servidor revalida os seis dígitos e registra a decisão.
    ie=finalize(c,prepared(c,ids[:2],classes,versions=1));ic=c.call('cards',exam_id=ie)['cards'][0]
    def id_scores(value):return [[1 if int(d)==a else 0 for a in range(10)] for d in value]
    def identity_scan(sid,identity,expected=200):
        return c.call('scan',{'exam_id':ie,'token':ic['token'],'student_id':sid,'scores':[[1,0,0,0,0]]*2,'quality':quality,'identity':identity},expected=expected)
    identity_scan(students[0],True,422)
    identity_scan(students[1],{'scores':id_scores('000000'),'method':'confirmed'},409)
    identity_scan(students[0],{'scores':id_scores('000000')},422)
    identity_scan(students[0],{'scores':[[0]*10]*6,'method':'confirmed'},409)
    identity_scan(students[0],{'scores':[[0]*9]*6,'method':'manual'},422)
    identity_scan(students[0],{'scores':id_scores('000000'),'method':'confirmed'})
    identity_scan(students[1],{'scores':id_scores('999999'),'method':'manual'})
    identity_scan(students[2],{'scores':None,'method':'manual'})
    identity_scan(students[3],{'scores':id_scores('000004'),'method':'manual'})
    with sqlite3.connect(tmp/'test.sqlite') as db:
        got=db.execute('SELECT b.student_id,c.detected_external_id,c.identity_method,c.id_status,c.student_id_scores FROM cards c JOIN booklets b ON b.id=c.booklet_id WHERE b.exam_id=? AND b.student_id IS NOT NULL ORDER BY b.student_id',(ie,)).fetchall()
        assert len(got)==4 and got[0][1:4]==('000000','confirmed','recognized') and len(json.loads(got[0][4]))==6
        assert got[1][1:4]==('999999','manual','recognized') and got[2][1:4]==(None,'manual','unreadable') and got[3][1:4]==('000004','manual','recognized')
        db.execute('INSERT INTO students(school_id,external_id,name,class_id) VALUES(?,?,?,?)',(school,'000004','ID equivalente de teste',classes[0]))
    db.close()
    duplicate=finalize(c,prepared(c,ids[:2],classes,versions=1));dc=c.call('cards',exam_id=duplicate)['cards'][0]
    body={'exam_id':duplicate,'token':dc['token'],'student_id':students[4],'scores':[[1,0,0,0,0]]*2,'quality':quality,'identity':{'scores':id_scores('000004'),'method':'confirmed'}}
    c.call('scan',body,expected=409);body['identity']['method']='manual';c.call('scan',body)
    # Duplicata só participa deste teste: não interfere nas sugestões da prova da câmera.
    with sqlite3.connect(tmp/'test.sqlite') as db:db.execute("UPDATE students SET external_id='TEST-DUPLICATE' WHERE external_id='000004'")
    db.close()
    check(True,'ID: zeros à esquerda, confirmação validada, divergência/duplicidade bloqueadas, seleção manual e medições auditadas')
    # Isolamento entre escolas nas novas operações.
    with sqlite3.connect(tmp/'test.sqlite') as db:
        hashed=db.execute('SELECT password FROM users LIMIT 1').fetchone()[0]
        other=db.execute("INSERT INTO schools(name) VALUES('Outra escola de teste')").lastrowid
        db.execute('INSERT INTO users(school_id,name,email,password,role) VALUES(?,?,?,?,?)',(other,'Outro','other@example.invalid',hashed,'teacher'))
    db.close()
    b=Client();b.call('state');b.call('login',{'email':'other@example.invalid','password':password})
    b.call('bank_question',id=ids[0],expected=404);b.call('bank_save',{**qs[0]},expected=404);b.call('version_content',exam_id=eid,version_id=e['versions'][0]['id'],expected=404);b.call('exam_pdf',exam_id=eid,expected=404);b.call('add_versions',{'exam_id':eid,'count':1},expected=404)
    b.call('exam_cover',id=cv['id'],expected=404);b.call('save_pdf_settings',config,expected=404);b.call('exam_pdf',exam_id=eid,cover=cv['id'],expected=404)
    b.call('question_image',id=image['id'],expected=404);b.call('bank_save',{**base,'image_id':image['id']},expected=404)
    check(b.call('bank_list')['total']==0,'banco, versões e PDFs isolados por escola')
    with sqlite3.connect(tmp/'test.sqlite') as db:check(not db.execute('PRAGMA foreign_key_check').fetchall(),'integridade referencial após correções, novas versões e edição do banco')
    db.close()
    subprocess.run(['python','tests/bank_pdf.py'],cwd=ROOT,check=True,timeout=60)
    browser_env=os.environ.copy();browser_env.update(MARIOPROVAS_TEST_URL=BASE,MARIOPROVAS_TEST_EMAIL=email,MARIOPROVAS_TEST_PASSWORD=password,MARIOPROVAS_TEST_EXAM=str(eid),MARIOPROVAS_MULTI_EXAM=str(multi))
    subprocess.run(['node','tests/bank-browser.mjs'],cwd=ROOT,env=browser_env,check=True,timeout=180)
    ui_cover=pymupdf.open(ART/'bank-ui-cover-preview.pdf');assert len(ui_cover)==1 and 'CAPA PERSONALIZADA DE TESTE' in ui_cover[0].get_text() and 'ID / Matrícula' in ui_cover[0].get_text()
    ui_cover[0].get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(ART/'bank-ui-cover-preview.png')
    ui_all=pymupdf.open(ART/'bank-ui-todas-versoes.pdf');assert sum('CAPA PERSONALIZADA DE TESTE' in p.get_text() for p in ui_all)==2
    check(True,'PDF moderno preparado no navegador preserva capa, cartão e todas as versões no download real')
    print(f'Concluído: {len(checks)} verificações de banco/versões + interface em navegador.',flush=True)
except Exception:
    log.flush();print((tmp/'server.log').read_text(errors='replace')[-4500:]);raise
finally:
    server.terminate();server.wait(timeout=10);log.close()
    if 'db' in globals():db.close()
    assert tmp.parent==pathlib.Path(tempfile.gettempdir()).resolve() and tmp.name.startswith('marioprovas-bank-')
    for item in tmp.iterdir():
        if item.is_file():item.unlink()
    tmp.rmdir()
