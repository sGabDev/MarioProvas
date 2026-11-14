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
    if count==61:assert '(continuação)' in text,'Enunciado extenso deve continuar em outra coluna/página'
    for i,page in enumerate(pdf):
        assert 'Página '+str(i+1) in page.get_text()
        for block in page.get_text('dict')['blocks']:
            for line in block.get('lines',[]):
                for span in line['spans']:
                    x0,y0,x1,y1=span['bbox'];assert x0>=20 and y0>=20 and x1<=page.rect.width-20 and y1<=page.rect.height-20,(name,i,span['text'])
        page.get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/(pathlib.Path(name).stem+f'-p{i+1}.png'))
    print('OK:',name,len(pdf),'página(s), questões completas e texto dentro da página')
pdf=pymupdf.open(root/'bank-gabaritos.pdf')
for i,page in enumerate(pdf):
    label=chr(65+i);text=page.get_text();assert 'VERSÃO '+label in text and 'Versão '+label+' | Página' in text
    assert len(re.findall(r'Questão \d+\s+\|',text))==8
    page.get_pixmap(matrix=pymupdf.Matrix(1.3,1.3)).save(root/f'bank-gabarito-{label}.png')
print('OK: gabaritos separados por versão e rodapés correspondentes')
