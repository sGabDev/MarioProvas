"""Inspeção estrutural e renderização dos PDFs criados por bank_integration.py.
Dependência apenas de desenvolvimento: pip install pymupdf.
"""
import pathlib,re
import pymupdf
root=pathlib.Path(__file__).resolve().parents[1]/'tests/artifacts'
for name,count in [('bank-prova-1-colunas.pdf',8),('bank-prova-2-colunas.pdf',8),('bank-multipagina-2-colunas.pdf',61)]:
    pdf=pymupdf.open(root/name);text='\n'.join(p.get_text() for p in pdf)
    numbers=[int(n) for n in re.findall(r'Questão (\d+) - ',text)]
    assert sorted(numbers)==list(range(1,count+1)),(name,numbers)
    assert 'GABARITO' not in text and '(correta)' not in text
    assert 'CAPA - VERSÃO ' in pdf[0].get_text() and 'Cartão-resposta' in pdf[0].get_text()
    assert not re.search(r'Questão \d+ - ',pdf[0].get_text()),'A primeira folha deve ser apenas capa/cartão'
    first_question=next(i for i,p in enumerate(pdf) if re.search(r'Questão \d+ - ',p.get_text()))
    assert first_question>=1 and all('CAPA - VERSÃO ' in pdf[i].get_text() for i in range(first_question)), 'As questões começam depois das capas/cartões'
    if count==8:assert any(page.get_images() for page in pdf),'Imagem da questão deve estar no PDF'
    if count==61:assert '(continuação)' in text,'Enunciado extenso deve continuar em outra coluna/página'
    for i,page in enumerate(pdf):
        assert 'Página '+str(i+1) in page.get_text()
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
pdf=pymupdf.open(root/'bank-gabaritos.pdf')
for i,page in enumerate(pdf):
    label=chr(65+i);text=page.get_text();assert 'VERSÃO '+label in text and 'Versão '+label+' | Página' in text
    assert len(re.findall(r'Questão \d+\s+\|',text))==8
    page.get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/f'bank-gabarito-{label}.png')
print('OK: gabaritos separados por versão e rodapés correspondentes')
pdf=pymupdf.open(root/'bank-todas-versoes.pdf');covers=[];labels=[];current=None
for i,page in enumerate(pdf):
    text=page.get_text()
    if 'CAPA - VERSÃO ' in text:
        label=re.search(r'CAPA - VERSÃO ([A-Z])',text)[1];covers.append(i);labels.append(label);current=label
        assert not re.search(r'Questão \d+ - ',text)
    assert 'Versão '+current+' | Página' in text,'Rodapé precisa corresponder à versão atual'
assert labels==[chr(65+i) for i in range(5)]
for start,end in zip(covers,covers[1:]+[len(pdf)]):
    section='\n'.join(pdf[i].get_text() for i in range(start,end));assert len(re.findall(r'Questão \d+ - ',section))==8
print('OK: PDF único contém capa/cartão e prova completa de cada uma das cinco versões')
