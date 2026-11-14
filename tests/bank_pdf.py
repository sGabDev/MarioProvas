"""Inspeção estrutural e renderização dos PDFs criados por bank_integration.py.
Dependência apenas de desenvolvimento: pip install pymupdf.
"""
import pathlib,re,json
import pymupdf
root=pathlib.Path(__file__).resolve().parents[1]/'tests/artifacts'
for name,count in [('bank-prova-1-colunas.pdf',8),('bank-prova-2-colunas.pdf',8),('bank-multipagina-2-colunas.pdf',61)]:
    pdf=pymupdf.open(root/name);text='\n'.join(p.get_text() for p in pdf)
    numbers=[int(n) for n in re.findall(r'Questão (\d+) - ',text)]
    assert sorted(numbers)==list(range(1,count+1)),(name,numbers)
    assert 'GABARITO' not in text and '(correta)' not in text
    assert 'ID / Matrícula' in pdf[0].get_text() and 'Versão ' in pdf[0].get_text()
    assert 'Página' not in pdf[0].get_text() and 'Prova de integração' not in pdf[0].get_text()
    assert not re.search(r'Questão \d+ - ',pdf[0].get_text()),'A primeira folha deve ser apenas capa/cartão'
    first_question=next(i for i,p in enumerate(pdf) if re.search(r'Questão \d+ - ',p.get_text()))
    assert first_question>=1 and all('ID / Matrícula' in pdf[i].get_text() for i in range(first_question)), 'As questões começam depois das capas/cartões'
    if count==8:assert any(page.get_images() for page in pdf),'Imagem da questão deve estar no PDF'
    if count==61:assert '(continuação)' in text,'Enunciado extenso deve continuar em outra coluna/página'
    for i,page in enumerate(pdf):
        if i>=first_question:assert 'Página '+str(i+1) in page.get_text()
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines',[]):
                for span in line['spans']:
                    x0,y0,x1,y1=span['bbox'];assert x0>=20 and y0>=20 and x1<=page.rect.width-20 and y1<=page.rect.height-20,(name,i,span['text'])
        page.get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/(pathlib.Path(name).stem+f'-p{i+1}.png'))
    print('OK:',name,len(pdf),'página(s), questões completas e texto dentro da página')
    if name in ['bank-prova-2-colunas.pdf','bank-multipagina-2-colunas.pdf']:
        block=0
        for page in list(pdf)[:first_question]:
            markers=[]
            for path in page.get_drawings():
                if path.get('fill')!=(0,0,0):continue
                for item in path['items']:
                    if item[0]=='re' and abs(item[1].width-4*72/25.4)<.15 and abs(item[1].height-4*72/25.4)<.15:markers.append(item[1])
            assert len(markers)%4==0 and markers,'Cada bloco precisa das quatro marcas originais de 4 mm'
            for start in range(0,len(markers),4):
                block+=1;group=markers[start:start+4];clip=pymupdf.Rect(min(r.x0 for r in group)-12,min(r.y0 for r in group)-12,max(r.x1 for r in group)+12,max(r.y1 for r in group)+12)
                filename='bank-cover-b-card.png' if count==8 else f'bank-cover-multi-{block}.png'
                page.get_pixmap(matrix=pymupdf.Matrix(3,3),clip=clip).save(root/filename)
        assert block==(1 if count==8 else 2)
        for page in list(pdf)[:first_question]:
            markers=[item[1] for path in page.get_drawings() if path.get('fill')==(0,0,0) for item in path['items'] if item[0]=='re' and abs(item[1].width-4*72/25.4)<.15 and abs(item[1].height-4*72/25.4)<.15]
            box=pymupdf.Rect(markers[0]);[box.include_rect(r) for r in markers[1:]]
            assert abs((box.x0+box.x1)/2-page.rect.width/2)<1 and abs((box.y0+box.y1)/2-page.rect.height/2)<1,'Cartão deve ficar no centro da capa'
pdf=pymupdf.open(root/'bank-gabaritos.pdf')
for i,page in enumerate(pdf):
    label=chr(65+i);text=page.get_text();assert 'VERSÃO '+label in text and 'Versão '+label+' | Página' in text
    assert len(re.findall(r'Questão \d+\s+\|',text))==8
    page.get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/f'bank-gabarito-{label}.png')
print('OK: gabaritos separados por versão e rodapés correspondentes')
pdf=pymupdf.open(root/'bank-todas-versoes.pdf');covers=[];labels=[];current=None
for i,page in enumerate(pdf):
    text=page.get_text()
    if 'ID / Matrícula' in text:
        label=re.search(r'Versão ([A-Z]) \| Bloco',text)[1];covers.append(i);labels.append(label);current=label
        assert not re.search(r'Questão \d+ - ',text)
    if 'ID / Matrícula' not in text:assert 'Versão '+current+' | Página' in text,'Rodapé precisa corresponder à versão atual'
assert labels==[chr(65+i) for i in range(5)]
for start,end in zip(covers,covers[1:]+[len(pdf)]):
    section='\n'.join(pdf[i].get_text() for i in range(start,end));assert len(re.findall(r'Questão \d+ - ',section))==8
print('OK: PDF único contém capa/cartão e prova completa de cada uma das cinco versões')

expected=json.loads((root/'bank-layout-expected.json').read_text('utf-8'))
image_numbers=[q['position'] for q in expected if q['image_id']]
text_numbers=[q['position'] for q in expected if not q['image_id']]
def numbers(pdf):return [int(n) for page in pdf for n in re.findall(r'Questão (\d+) - ',page.get_text())]
def dividers(page):
    return [(item[1].y,item[2].y) for path in page.get_drawings() for item in path['items'] if item[0]=='l' and abs(item[1].x-105*72/25.4)<.2 and abs(item[2].x-item[1].x)<.2 and abs(item[2].y-item[1].y)>10]
grouped=pymupdf.open(root/'bank-prova-2-colunas.pdf')
assert numbers(grouped)==text_numbers+image_numbers,'Agrupamento muda só o local, preservando os números do gabarito'
assert any(dividers(p) for p in grouped),'Duas colunas precisam de uma linha divisória'
for page in grouped:
    for info in page.get_image_info():
        r=pymupdf.Rect(info['bbox']);assert r.width>87*72/25.4 and abs((r.x0+r.x1)/2-page.rect.width/2)<1,'Imagem deve ser centralizada em largura inteira'
        assert all(max(y0,r.y0)>=min(y1,r.y1)-1 for y0,y1 in dividers(page)),'Linha divisória não pode atravessar uma questão com imagem'
single=pymupdf.open(root/'bank-prova-1-colunas.pdf');assert numbers(single)==list(range(1,9)) and not any(dividers(p) for p in single)
ungrouped=pymupdf.open(root/'bank-ungrouped.pdf');assert numbers(ungrouped)==list(range(1,9))
for page in ungrouped:
    for info in page.get_image_info():
        r=pymupdf.Rect(info['bbox']);assert r.width>87*72/25.4
        assert all(max(y0,r.y0)>=min(y1,r.y1)-1 for y0,y1 in dividers(page))
    page.get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/f'bank-ungrouped-p{page.number+1}.png')
images=pymupdf.open(root/'bank-images-only.pdf');assert len(images)==2 and len(images[1].get_image_info())==2,'Questões com imagem devem compartilhar a folha quando couberem'
assert not any(dividers(p) for p in images)
images[1].get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/'bank-images-together.png')
custom=pymupdf.open(root/'bank-custom-cover.pdf');preview=pymupdf.open(root/'bank-custom-preview.pdf')
assert len(preview)==1 and 'Questão ' not in preview[0].get_text()
for doc in [custom,preview]:
    assert 'CAPA PERSONALIZADA DE TESTE' in doc[0].get_text() and 'Rodape do modelo enviado' in doc[0].get_text()
    pix=doc[0].get_pixmap();assert pix.pixel(int(doc[0].rect.width/2),int(doc[0].rect.height/2))[:3]==(255,255,255),'Cartão deve cobrir o fundo com branco'
custom[0].get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/'bank-custom-cover-p1.png')
all_custom=pymupdf.open(root/'bank-custom-all.pdf');assert sum('CAPA PERSONALIZADA DE TESTE' in p.get_text() for p in all_custom)==5
print('OK: linha divisória, imagens em largura inteira agrupadas/opcionais, economia de folhas, capa branca centralizada e PDF personalizado em todas as versões')
