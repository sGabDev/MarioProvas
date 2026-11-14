# Banco de questões, provas e versões

Esta funcionalidade amplia o MarioProvas em PHP 8.2, PDO SQLite e JavaScript
nativo. Os cadastros, simulados anteriores, cartões, câmera, notas e relatórios
continuam no mesmo sistema. Não há serviço externo para gerar os PDFs.

## Criar questões

No menu **Banco de questões**, clique em **Nova questão**. Cadastre enunciado,
de duas a cinco alternativas, resposta correta, disciplina, área, assunto e
dificuldade (fácil, média ou difícil). Os textos aceitam quebras de linha e
caracteres Unicode; são texto simples, sem editor de fórmulas LaTeX.

No campo **Imagem do enunciado**, anexe uma imagem **PNG ou JPEG de até 4 MB**.
Confira a prévia antes de salvar. É possível substituir ou remover a imagem
na edição. O cadastro também está disponível em **Criar questão agora**, durante
a montagem da prova. A interface ajusta imagens grandes para até 2000 pixels
por lado, preservando a proporção. A imagem aparece no enunciado, na conferência
das versões e no PDF. Cada prova preserva a imagem que recebeu ao ser criada;
substituir ou remover a imagem no banco não altera provas anteriores.

Use **Pesquisar e filtrar** para combinar texto, disciplina, área, assunto,
dificuldade e quantidade de alternativas. A busca de texto ignora diferenças
de maiúsculas/minúsculas, inclusive letras acentuadas. As listas têm páginas de
40 questões. **Abrir / editar** permite conferir e atualizar o conteúdo.
**Arquivar** retira a questão de novas seleções, preservando provas existentes.
Edições concorrentes são detectadas pela revisão do cadastro.

## Montar e conferir a prova

1. Abra **Montar prova**. Informe título, data, duração em minutos, quantidade de
   questões, quantidade de versões e as turmas participantes. Todos os estudantes
   cadastrados nas turmas escolhidas serão incluídos.
2. Escolha a quantidade de alternativas. Todas as questões da mesma prova devem
   usar essa quantidade, conforme o formato do leitor existente.
   Em **Colunas das questões e alternativas no PDF**, escolha **1 coluna** ou
   **2 colunas** antes de preparar a prévia e finalizar. Essa preferência é
   salva com a prova e usada nos downloads individuais e no PDF com todas as
   versões. As alternativas acompanham a coluna da sua questão.
3. Em **Escolher no banco**, pesquise, expanda os enunciados e marque as questões.
   A seleção é mantida ao trocar filtros e páginas. Use as setas para ordenar as
   questões na lista de referência; a quantidade selecionada deve coincidir com
   a quantidade pedida no formulário.
   Para cadastrar durante a montagem, clique em **Criar questão agora** e
   preencha o formulário. **Salvar e incluir na prova** salva no banco e inclui
   a questão na seleção, mantendo os dados da prova, os filtros e as questões
   anteriores. A quantidade de alternativas acompanha a prova. Se a seleção
   ultrapassar a quantidade pedida, esse total será aumentado automaticamente.
   O cadastro ativa a seleção manual; se já houver uma prévia automática, as
   questões sorteadas nela são mantidas junto com a nova questão. Prepare a
   prévia novamente antes de finalizar. Fechar o cadastro sem salvar mantém a
   montagem e a prévia anteriores.
4. Para uma seleção automática, escolha **Selecionar automaticamente pelos
   filtros**, preencha os filtros e prepare a prévia. Se o banco não tiver
   questões suficientes, o sistema informa o problema sem criar uma prova.
5. Na lista de referência, **Fixar questão** conserva sua posição em todas as
   versões. Marque letras em **Alternativas que mantêm a letra** para conservar
   as alternativas nessas posições. As demais posições são embaralhadas.
6. Clique em **Preparar prévia das versões**. Troque entre A, B, C etc. para
   conferir a ordem, alternativas e respostas corretas. **Ajustar esta seleção
   e posições fixas** também permite transformar uma seleção automática em
   manual, sem sortear novamente as questões selecionadas.
7. Clique em **Finalizar e criar prova**. Só então a prova, seus participantes,
   cópias do conteúdo, versões e modelos de cartão são gravados juntos. A prévia
   expira após duas horas e é invalidada na tela quando o formulário é alterado.

São aceitas de 1 a 240 questões, duração de 1 a 1440 minutos, até 30 combinações
de disciplina/área e até 26 versões (A a Z). O sistema impede versões com mapas
idênticos. Se as posições fixas impossibilitarem mais versões distintas, reduza
a quantidade de versões ou libere posições. Depois de finalizar, use **Gerar
mais versões** na tela da prova. Versões já existentes nunca são sorteadas de
novo; as novas também usam a cópia preservada do conteúdo.

## Imprimir prova, gabaritos e cartões

Na tela da prova, a tabela **Prova e versões** oferece, para cada versão:

- **Ver questões**: conferência do conteúdo salvo.
- **Baixar PDF**: começa com a **capa e o cartão-resposta da versão**. As questões
  começam na folha seguinte, com a quantidade de colunas escolhida na criação,
  imagens, cabeçalho, duração e paginação. Se quiser uma impressão diferente,
  também pode ajustar as colunas acima da tabela antes de baixar. Questões
  extensas continuam em outra coluna/página com indicação de continuação.
- **Baixar todas as versões em um PDF**: reúne A, B, C etc. no mesmo arquivo.
  Cada versão começa em uma capa nova, com seu cartão e suas questões em
  seguida. Os QR codes são os mesmos dos downloads individuais e dos modelos
  já existentes; reabrir o PDF não gera novas ordens nem novos códigos.
- **Gabarito PDF**: arquivo exclusivo do professor, correspondente àquela
  versão. **Todos os gabaritos em PDF separado** reúne os gabaritos, iniciando
  cada versão em uma página nova. Os PDFs dos estudantes não contêm respostas.
- **Cartão A / PNG**, **Cartão B / PNG** etc.: abre a impressão e exportação já
  existentes com o modelo correspondente. O arquivo PNG inclui a versão no
  nome, e a impressão direta mostra versão e bloco fora das marcas ópticas.

**Entregue sempre a prova e o cartão da mesma versão.** Cada versão tem seus
próprios QR codes. O mesmo modelo pode ser copiado para vários estudantes que
receberem aquela versão. Não use o cartão A para um estudante com a prova B.
O sistema identifica o cartão apresentado; não fotografa o caderno de questões
para inferir qual caderno foi entregue ao aluno.

Para mais de 60 questões, imprima todos os blocos do modelo da mesma versão.
Os PDFs das provas já incluem esses blocos na capa. Se os blocos não couberem
com as dimensões físicas corretas, o sistema acrescenta folhas de capa para
eles antes das questões. As bolhas e as referências não são reduzidas para
forçar todos os cartões a caberem em uma folha. Não é necessário anexar o PNG
manualmente ao PDF gerado pelo sistema.
O PNG conserva o formato limpo da integração anterior: ao inserir na capa,
identifique a versão no texto da capa e mantenha as dimensões físicas
indicadas. Não recorte QR, margens nem as quatro referências.

## Ler, revisar e consultar resultados

1. Na prova, clique em **Ler cartões** e **Ativar câmera**.
2. Enquadre o cartão inteiro com suas quatro referências. A revisão mostra
   **Versão A**, **Versão B** etc., identificada pelo QR no servidor.
3. Abra **Conferir imagem e marcações** e confira alternativas reconhecidas,
   brancos e múltiplas. Nada é corrigido definitivamente nessa revisão. Use
   **Refazer esta leitura** para recapturar quando necessário.
4. Selecione o estudante correto e confirme **Salvar e continuar**.
5. Nas provas com várias páginas, selecione o mesmo estudante em todos os
   blocos da mesma versão. Páginas parciais são preservadas. Tentar misturar
   blocos de versões diferentes para um aluno é bloqueado. Um resultado só é
   produzido após ler todos os blocos, e resultados duplicados são bloqueados.
6. Em **Ver resultados**, consulte aluno, turma, disciplina, área, brancos,
   erros, acertos, créditos por anulação e notas. Filtros de turma e série
   também valem para os resultados das novas provas. O CSV inclui a versão e
   os brancos nas provas criadas com o banco.

O resultado individual mostra a numeração e as letras **da versão recebida**,
além da referência à questão original. As análises agregadas por questão e o
editor de gabarito usam a **ordem original da seleção**, comum a todas as
versões. O editor permite abrir enunciado e alternativas originais para evitar
confusão com as letras impressas de outra versão.

## Como a correção preserva a versão

`question_snapshots` guarda a cópia do enunciado, alternativas, classificação e
restrições. `exam_versions` e `version_questions` guardam cada questão na sua
posição impressa e a permutação das alternativas. `booklets.version_id` vincula
o QR e a tentativa do estudante à versão. Essas relações são persistidas antes
da impressão; reabrir um PDF não embaralha nada.

`question_images` armazena os arquivos no SQLite privado, com controle de acesso
por escola. O cadastro aponta para uma imagem imutável; a prova guarda essa
mesma referência em sua cópia. Trocar a imagem cria outra referência e não
sobrescreve os bytes utilizados por provas anteriores. `exams.pdf_columns`
guarda a quantidade de colunas escolhida na criação.

As medições ópticas originais permanecem nos cartões. Ao concluir a leitura, o
servidor usa o mapa da versão do cartão para converter posições e letras para
a identidade original de cada questão. As respostas são comparadas ao gabarito
dessa identidade, permitindo comparar disciplinas/questões entre versões. O
relatório individual faz a conversão inversa para exibir as letras impressas.
O servidor não aceita um gabarito ou uma versão fornecidos pelo navegador na
gravação da leitura: a versão vem do QR persistido.

Editar o banco posteriormente não altera provas finalizadas, inclusive novas
versões geradas dessas provas. Uma **alteração intencional do gabarito ou
anulação na própria prova** continua permitida pelo fluxo anterior e recalcula
os resultados de todas as versões pela identidade da questão. Não altera os
enunciados, ordens, QR codes ou medições já lidas.

## Identificar o aluno pela matrícula/ID

Os cartões novos, tanto no PDF da capa quanto no PNG e no formato A4, incluem
**seis colunas numéricas**. Escreva o ID nas seis caixas superiores e preencha
**uma bolha de 0 a 9 em cada coluna**, na mesma ordem. A câmera lê as bolhas;
preencher apenas as caixas à mão não identifica o aluno.

Use a matrícula/ID do cadastro do estudante. Complete IDs menores com zeros à
esquerda: `1234` fica `001234`. IDs com mais de seis dígitos ou letras continuam
usando a seleção manual; nenhum número é cortado para tentar uma associação.

Ao abrir **Corrigir com câmera** e ler o cartão:

1. Se houver um único participante correspondente e disponível para essa folha,
   aparecem o ID lido, nome, turma e a pergunta **É este aluno mesmo?**.
2. Clique em **Sim, é este aluno** ou em **Escolher outro aluno** para pesquisar
   e selecionar manualmente. A sugestão não salva nem confirma sozinha.
3. Se o ID estiver em branco, incompleto, ambíguo, desconhecido ou corresponder
   a cadastros equivalentes (como `1234` e `001234`), o sistema informa o motivo
   e permite selecionar o estudante manualmente ou refazer a leitura.
4. Confira a imagem e as respostas. Só **Salvar e continuar** grava a folha e
   a associação escolhida, respeitando a versão identificada pelo QR.

Em provas com vários blocos, preencha o mesmo ID em todos eles. Um aluno já
corrigido ou vinculado a outro modelo não é sugerido para uma nova tentativa.
Os cartões antigos continuam aceitos com a seleção manual existente.

A leitura dos seis dígitos, seu estado e a confirmação ou escolha manual ficam
registrados junto à folha. O servidor revalida a correspondência ao confirmar.
A migração v5 acrescenta esses campos sem alterar cartões ou resultados antigos.
Com o espaço para a matrícula, o compacto de 60 questões/cinco alternativas mede
**16 × 17,08 cm**. Confira sempre as dimensões indicadas ao baixar o PNG; blocos
adicionais podem ocupar outra folha de capa antes das questões.

## Atualização, dependências e verificação

Preserve `config.php` e `storage/` ao atualizar. A migração v5 é automática e
aditiva, sem reinstalação ou importação de dados de demonstração. Faça o backup
privado habitual antes de atualizar uma instalação em uso. Recarregue com
**Ctrl+F5**; a PWA usa cache v11 e os recursos alterados têm URLs versionadas.

O PDF usa tFPDF 1.33 e fontes DejaVu locais, em `app/vendor/tfpdf/`, com suas
licenças e métricas portáveis. O servidor continua dependendo somente do PHP
e das extensões já exigidas. Não precisa de Composer, Node, Python ou rede
para gerar os arquivos. Não é necessário dar escrita à pasta de código.
O QR nativo do PDF usa a implementação PHP de Kazuhiko Arase, do mesmo projeto
do gerador JavaScript já utilizado, em `app/vendor/qrcode/`, com licença MIT
e versão fixada em `SOURCE.txt`. Os cartões são desenhados em vetor no PDF,
com bolhas de 4 mm, sem precisar de GD, conversão de SVG ou serviços externos.

Verificações de desenvolvimento, executadas em bancos temporários:

```powershell
npm.cmd run test:omr
python tests/integration.py
python tests/migration.py
python tests/bank_integration.py
python tests/bank_pdf.py
C:\xampp\php\php.exe scripts/check.php
```

`bank_integration.py` cobre API e navegador real (Playwright/Chrome), criação e
edição na interface, prévia, posições fixas, PDFs, isolamento entre escolas,
imutabilidade, seleção automática, recálculo, anulação, identificação de seis
dígitos, confirmação/troca e seleção manual do aluno, cartões multipágina e
leitura/revisão/confirmação de uma versão B usando pixels do cartão extraído
da capa em PDF, além de conferir o PNG exportado e os blocos de 60 e 1 questões
da capa multipágina. Verifica PNG com transparência, JPEG, imagens preservadas
e o PDF único de todas as versões. O acesso à câmera é substituído por um stream desse cartão somente
no teste. `bank_pdf.py` usa PyMuPDF apenas para conferir os PDFs de teste e gerar
PNGs para inspeção. Artefatos ficam em `tests/artifacts/`, fora do pacote.

Esses testes não homologam câmera física, papel, impressora ou iluminação da
escola. Antes da primeira aplicação, execute o roteiro de impressão e câmera
do README com cartões de cada versão.
