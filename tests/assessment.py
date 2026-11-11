"""Regressões de notas/gabarito/filtros, exclusivamente na base temporária."""
import csv, io, sqlite3, copy

def verify(c, check, db_path, exam_id, cid, cid2, cid3, sid, sid2):
    def exam(): return c.call('exam',params={'id':exam_id})
    def report(**filters): return c.call('report',params={'id':exam_id,**filters})
    def students(): return {s['student_id']:s for s in report()['students']}
    def policy(metric,bands): return {'scope':'total','rules':[{'metric':metric,'bands':[dict(zip(['min','max','points'],b)) for b in bands]}]}
    def save_policy(p,**kwargs): return c.call('update_grading',{'exam_id':exam_id,'revision':exam()['revision'],'grading_policy':p,**kwargs})
    def save_key(answer='B',annul=(),**kwargs):
        e=exam();return c.call('update_key',{'exam_id':exam_id,'revision':e['revision'],'questions':[{'id':q['id'],'answer':answer,'annulled':q['number'] in annul} for q in e['questions']],**kwargs})
    def evidence():
        with sqlite3.connect(db_path) as db:
            return (db.execute('SELECT c.id,c.token,c.scores,c.scanned_at FROM cards c JOIN booklets b ON b.id=c.booklet_id WHERE b.exam_id=? ORDER BY c.id',(exam_id,)).fetchall(),db.execute('SELECT rp.result_id,rp.question_id,rp.marked FROM responses rp JOIN results r ON r.id=rp.result_id WHERE r.exam_id=? ORDER BY rp.result_id,rp.question_id',(exam_id,)).fetchall())
    original=evidence()
    check(all(s['valid']==71 and s['annulled']==0 and s['incorrect']==60 for s in students().values()),'branco e múltiplas são erros válidos, sem anulações automáticas')
    before=exam()['revision'];out=save_policy(policy('correct',[(0,10,1),(11,71,8)]))
    check(out['recalculated']==2 and all(s['grade']==8 for s in students().values()),'faixas por quantidade de acertos recalculam os dois alunos')
    c.call('update_grading',{'exam_id':exam_id,'revision':before,'grading_policy':None},expected=409)
    c.call('update_grading',{'exam_id':exam_id,'revision':exam()['revision'],'grading_policy':None},csrf=False,expected=403)
    check(all(s['grade']==8 for s in students().values()),'versão desatualizada e ausência de CSRF impedem alteração das notas')
    save_policy(policy('percentage',[(0,20,3),(20,100,10)]))
    check(all(s['grade']==3 for s in students().values()),'faixas por percentual usam o total de questões válidas')
    # Validação e rollback não podem tocar em nenhuma resposta/nota.
    revision=exam()['revision']
    invalid=[policy('correct',[(0,10,1),(10,71,8)]),policy('correct',[(0,10,1),(12,71,8)]),policy('percentage',[(0,20,1),(21,100,8)]),policy('percentage',[(0,99,1)]),policy('correct',[(0,71,-1)]),policy('correct',[(0,71,1.001)]),{'scope':'areas','rules':[]}]
    invalid.append(policy('correct',[(0,10,10),(11,71,1)]))
    for p in invalid:c.call('update_grading',{'exam_id':exam_id,'revision':revision,'grading_policy':p},expected=422)
    c.call('update_grading',{'exam_id':exam_id,'revision':revision,'grading_policy':None,'annulment_mode':'exclude'},expected=422)
    key=[{'id':q['id'],'answer':'B','annulled':False} for q in exam()['questions']];key[-1]['answer']='Z'
    c.call('update_key',{'exam_id':exam_id,'revision':revision,'questions':key},expected=422)
    c.call('update_key',{'exam_id':exam_id,'revision':revision,'questions':key[:-1]},expected=422)
    c.call('update_key',{'exam_id':exam_id,'revision':revision,'questions':[None]*71},expected=422)
    check(exam()['revision']==revision and all(q['answer']=='A' for q in exam()['questions']) and all(s['grade']==3 for s in students().values()),'faixas inválidas e gabarito incompleto/inválido são rejeitados com rollback integral')
    save_key();ss=students()
    check(ss[sid]['correct']==12 and ss[sid2]['correct']==60 and ss[sid2]['grade']==10,'editar gabarito recalcula acertos e notas sem reler o papel')
    save_key(annul={1});ss=students()
    check(ss[sid]['correct']==12 and ss[sid]['credited']==1 and ss[sid]['annulled']==1 and ss[sid]['valid']==70 and ss[sid]['percentage']==18.31 and ss[sid2]['correct']==59 and ss[sid2]['percentage']==84.51,'anular dá crédito a todos e preserva o ponto de quem já acertava')
    ind=c.call('individual',params={'id':ss[sid]['id']})
    check(ind['responses'][0]['status']=='annulled' and ind['responses'][5]['status']=='blank' and ind['responses'][7]['status']=='multiple' and ind['considered']==71,'individual distingue anulação global de branco e múltiplas incorretas')
    save_key() # Reverter anulação usa a leitura original.
    e=exam();p={'scope':'areas','rules':[{'area_id':a['id'],'metric':'correct' if i!=1 else 'percentage','bands':[dict(zip(['min','max','points'],b)) for b in ([(0,0,0),(1,a['count'],2 if i==0 else 5)] if i!=1 else [(0,50,1),(50,100,4)])]} for i,a in enumerate(e['areas'])]}
    bad=copy.deepcopy(p);bad['rules'][0]['area_id']=0;c.call('update_grading',{'exam_id':exam_id,'revision':e['revision'],'grading_policy':bad},expected=422)
    save_policy(p);ss=students()
    check(ss[sid]['grade']==3 and ss[sid2]['grade']==6,'notas por áreas com métricas distintas são somadas no total')
    save_key(annul=set(range(1,72)));ss=students()
    check(all(s['grade']==11 and s['correct']==0 and s['valid']==0 and s['annulled']==71 and s['credited']==71 and s['percentage']==100 for s in ss.values()),'prova toda anulada dá pontuação integral a todos sem divisão por zero')
    save_key();save_policy(policy('percentage',[(0,0,0),(0,100,10)]))
    check(all(s['grade']==10 for s in students().values()),'faixas percentuais tratam o limite compartilhado sem lacuna decimal')
    # Limites de percentual: 12/71 pertence à faixa anterior, acima dela à próxima.
    boundary=100*12/71;save_policy(policy('percentage',[(0,boundary,2),(boundary,100,9)]));ss=students()
    check(ss[sid]['grade']==2 and ss[sid2]['grade']==9,'limite exato de percentual pertence à primeira faixa, sem arredondar o desempenho')
    check(original==evidence(),'recalcular preserva tokens, horários, medições ópticas e todas as marcas originais')
    c.call('class_update',{'id':cid,'grade_name':'SÉRIE FILTRO A'});c.call('class_update',{'id':cid2,'grade_name':'SÉRIE FILTRO B'})
    ra,rb=report(class_id=cid),report(grade_name='SÉRIE FILTRO B')
    check(len(ra['students'])==len(rb['students'])==1 and ra['students'][0]['student_id']==sid and rb['students'][0]['student_id']==sid2 and ra['mean_grade']==2 and rb['mean_grade']==9,'filtros por turma e série recalculam as médias do grupo selecionado')
    check(all(q['total']==1 for q in ra['questions']) and len(ra['student_areas'])==3 and all(h['student_id']==sid for h in ra['history']) and sum(ra['distribution'])==1,'questões, áreas, distribuição e evolução respeitam os mesmos filtros')
    empty=report(class_id=cid,grade_name='SÉRIE FILTRO B')
    check(not empty['students'] and empty['mean_percentage'] is None and not empty['history'] and all(q['total']==0 for q in empty['questions']),'interseção sem estudantes não vaza resultados de outras turmas')
    c.call('report',params={'id':exam_id,'class_id':cid3},expected=422);c.call('report',params={'id':exam_id,'grade_name':'SÉRIE INEXISTENTE'},expected=422)
    data=list(csv.reader(io.StringIO(c.call('export',params={'id':exam_id,'grade_name':'SÉRIE FILTRO B'},raw=True).decode('utf-8-sig')),delimiter=';'))
    check(len(data)==5 and len(data[0])==15 and all(r[14]=='SÉRIE FILTRO B' for r in data[1:]) and data[-1][13]=='9,00','CSV filtrado exporta somente a série selecionada e inclui nota, créditos e erros')
    save_policy(None);check(all(s['grade'] is None for s in students().values()),'desativar notas preserva correção e remove somente os pontos por faixa')
    # Novas leituras também precisam aplicar gabarito/anulações/notas atuais.
    fresh=c.call('create_exam',{'class_ids':[cid],'name':'LEITURA COM NOTAS (ISOLADA)','date':'2026-11-11','alternatives':5,'areas':[{'name':'Disciplina de teste','count':3,'answers':['A']*3}],'students':[sid]})['id']
    f=c.call('exam',params={'id':fresh});key=[{'id':q['id'],'answer':'A','annulled':q['number']==1} for q in f['questions']]
    c.call('update_key',{'exam_id':fresh,'revision':f['revision'],'questions':key})
    f=c.call('exam',params={'id':fresh});c.call('update_grading',{'exam_id':fresh,'revision':f['revision'],'grading_policy':policy('correct',[(0,0,0),(1,3,4)])})
    c.call('generate_cards',{'exam_id':fresh,'reusable':True});card=c.call('cards',params={'exam_id':fresh})['cards'][0]
    r=c.call('scan',{'exam_id':fresh,'token':card['token'],'student_id':sid,'scores':[[1,0,0,0,0],[0,0,0,0,0],[0,1,0,0,0]],'quality':{'markerCount':4,'contrast':255,'sharpness':100,'coverage':.5}})
    check(r['complete'] and r['correct']==0 and r['incorrect']==2 and r['valid']==2 and r['credited']==1 and r['annulled']==1 and r['percentage']==33.33 and r['grade']==4,'nova leitura salva a nota e os créditos do gabarito atual automaticamente')
