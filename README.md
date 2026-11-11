# MarioProvas

Aplicação implementada do zero para organizar estudantes, criar simulados, imprimir cartões, reconhecer **marcações no papel** e acompanhar resultados. Os dados ficam em SQLite no servidor. Não há estudantes, provas ou resultados de demonstração na base da aplicação.

## Tecnologias e requisitos

- **PHP 8.2+ e PDO SQLite**: instalação simples em hospedagem PHP, transações e persistência em arquivo privado. SQLite atende ao uso escolar em uma única instância; não requer processo Node nem Composer na hospedagem.
- **JavaScript nativo, Canvas e getUserMedia**: interface responsiva e processamento óptico no próprio dispositivo. jsQR 1.4.0 decodifica QR; qrcode-generator 1.4.4 gera QR. As bibliotecas e licenças estão em `public/assets/vendor/`, sem CDN em tempo de execução.
- **OMR próprio**: localização das quatro referências por contraste local e geometria, homografia, reamostragem da imagem, ajuste fino dos contornos das bolhas, medição do preenchimento, controle de contraste/desfoque e confirmação em duas capturas concordantes.
- **PWA** com manifesto, ícones e service worker. O cache contém somente recursos públicos e uma página offline. Dados escolares, imagens, cartões e APIs não são armazenados no cache da PWA. Não usa localStorage como banco.

Extensões necessárias: `pdo_sqlite`, `mbstring`, `session`, `json`. O diretório privado `storage/` deve permitir escrita ao PHP. `upload_max_filesize` deve aceitar 8 MB e `post_max_size` pelo menos 10 MB. `memory_limit` recomendado: 128 MB ou mais. Ative HTTPS antes de usar a câmera fora de localhost.

## Interface responsiva — ui9

CSS refatorado com tokens de cores/espaços/tipografia, base móvel, campos de 16 px, controles de pelo menos 44 px e áreas seguras. O menu móvel fecha por toque fora ou Escape, mantém o foco e tem botão de fechamento. Tabelas extensas rolam dentro do componente, com indicação visual e acesso por teclado; resultados individuais viram cards no telefone. Modais acompanham a viewport visual/teclado quando o navegador disponibiliza essa informação. Impressão/PNG preservam o SVG e o tamanho físico do cartão.

Foram executadas matrizes no Chrome e WebKit, de 320 a 1920 px, além de alturas menores e orientação horizontal. **Isso não equivale a homologação em hardware Android/iOS.** Veja o inventário de arquivos, comandos e limites em [docs/RESPONSIVIDADE.md](docs/RESPONSIVIDADE.md). Não houve mudanças de API, banco ou regras de negócio nesta refatoração. Ao atualizar, preserve configuração/dados, recarregue com Ctrl+F5 e reabra a PWA para carregar `ui9`/cache v9.

## Executar no computador

No PowerShell, dentro deste projeto:

```powershell
C:\xampp\php\php.exe scripts/check.php
C:\xampp\php\php.exe install.php
C:\xampp\php\php.exe -S localhost:8080 -t public scripts/dev-router.php
```

O instalador solicita escola, nome, e-mail e senha do primeiro administrador. A senha deve ter de 12 a 200 caracteres. A entrada no instalador CLI é visível no terminal; para entrada mascarada, use a instalação web abaixo. A instalação só pode acontecer uma vez por banco. Abra **http://localhost:8080**. No Apache/XAMPP configurado para este projeto, abra **http://localhost/**.

Se o DocumentRoot do Apache/XAMPP apontar para a raiz deste projeto, os arquivos públicos são servidos por reescrita interna: **http://localhost/** e **http://localhost/print?exam=1&sets=2**, sem `/public` nem `.html`. Também é possível apontar o document root diretamente para `public/`. Os dois modos aceitam instalação em subpasta e exigem `mod_rewrite`/`AllowOverride All`, ou equivalente no LiteSpeed. Não inicie o servidor embutido do PHP na raiz do projeto: ele não interpreta `.htaccess`. Use `-t public scripts/dev-router.php` como no comando acima, para ter as mesmas URLs limpas durante o desenvolvimento.

## Instalar na Hostinger

Use hospedagem **PHP**, não um plano restrito ao construtor visual. Confira a disponibilidade do PDO SQLite no seu plano e versão de PHP. No hPanel, as extensões e opções são gerenciadas na configuração do PHP; veja a [documentação oficial da Hostinger](https://www.hostinger.com/br/support/4667515-como-gerenciar-extensoes-e-opcoes-do-php-no-hpanel-hostinger/).

1. Envie o conteúdo de `dist/MarioProvas-hostinger.zip` e extraia preservando a estrutura. O pacote não inclui CSV, banco, credenciais nem dados reais.
2. **Preferível:** configure o document root do domínio/subdomínio para a pasta `public/`; mantenha `app/`, `storage/` e `config.php` fora desse document root. Se seu plano fixa a pasta `public_html`, extraia **a estrutura completa do pacote dentro dela**, incluindo o `.htaccess` da raiz e o de `public/`, e abra `https://seu-dominio/`. O arquivo da raiz encaminha internamente a interface, impressão e recursos autorizados; a pasta física `public/` permanece no servidor, mas não aparece na URL. Os bloqueios de arquivos/pastas privados devem ser preservados. Não mova somente o conteúdo de `public/`: isso quebra os caminhos PHP de configuração e banco.
3. Ative PHP 8.2+ com as extensões indicadas, ajuste o upload e dê permissão de escrita ao PHP somente em `storage/`. Não use permissão 777. Se houver SSH, execute `php scripts/check.php` e `php install.php` na raiz da aplicação.
4. **Sem SSH:** copie `config.example.php` para `config.php`, ao lado de `app/`. Defina `setup_key` com uma chave aleatória de pelo menos 32 caracteres. Abra o site e complete “Prepare sua escola” usando essa chave. Não existe senha padrão nem cadastro público. Depois de instalar, esvazie `setup_key` no arquivo e guarde o `config.php` privado. O banco impede nova instalação mesmo que a chave continue configurada.
5. Ative o certificado SSL e o redirecionamento HTTP → HTTPS no painel da hospedagem. Acesse o endereço HTTPS definitivo antes de instalar a PWA. A câmera depende de contexto seguro ([documentação de getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)). Um IP da rede local servido por HTTP não é equivalente a localhost.
6. Desative cache de página/CDN para `api.php`, páginas autenticadas e impressão. O projeto envia `Cache-Control: no-store, private`. Preserve cookies de sessão e cabeçalhos de segurança. Para Nginx ou servidores que ignoram `.htaccess`, exponha **somente `public/`** e implemente os cabeçalhos equivalentes.

### Atualizar a hospedagem: gerador QR e URLs limpas

O pacote atual usa um módulo ES local do qrcode-generator 1.4.4, em `public/assets/vendor/qrcode.mjs`. A impressão importa a função diretamente, sem depender de `window.qrcode`, da ordem de scripts `defer` ou de CDN. Envie esse arquivo novo junto com os demais arquivos atualizados; copiar apenas `print.html` não aplica a correção.

Para atualizar uma instalação existente, faça backup e extraia `dist/MarioProvas-hostinger.zip` na **mesma raiz em que já estão `app/`, `public/` e `config.php`**, substituindo os arquivos de código e os dois `.htaccess`. O pacote não contém `config.php`, CSV ou banco; preserve esses dados e não reinstale o sistema. No gerenciador de arquivos da Hostinger, habilite a exibição de arquivos ocultos para conferir os `.htaccess`. Não é necessário renomear nem remover a pasta física `public/`.

Depois do envio, a impressão abre em **`https://seu-dominio/print?exam=1&sets=2`**. Links anteriores com `/public/print.html` ou `/print.html` redirecionam para a rota limpa, conservando os parâmetros. `api.php`, scripts, imagens, manifesto e PWA continuam funcionando pela raiz. Consultas e gravações permanecem autenticadas. As regras usam `THE_REQUEST` para não redirecionar a reescrita interna e evitar ciclos; veja a [documentação de mod_rewrite do Apache](https://httpd.apache.org/docs/2.4/mod/mod_rewrite.html#rewritecond).

Limpe o cache da hospedagem/CDN, se estiver ativo, e recarregue com **Ctrl+F5**; em PWA, feche e reabra. A versão dos recursos é `ui9`. Se `/print` retornar 404, confira se os dois `.htaccess` foram enviados e se a reescrita de URL está habilitada no servidor. A mudança local só passa a valer no domínio depois que os arquivos forem enviados à hospedagem.
7. Teste sem autenticação: os endereços do CSV, `storage/`, `app/` e `config.php` devem retornar 403/404; a API não deve fornecer dados. Faça backup privado antes de colocar dados em uso.

O caminho do banco pode ser alterado em `config.php`. O padrão é `storage/marioprovas.sqlite`. O banco usa WAL; a pasta inteira precisa ser gravável. Variáveis de ambiente `MARIOPROVAS_DB` e `MARIOPROVAS_SETUP_KEY`, quando definidas pelo operador, têm prioridade sobre `config.php`; isso também permite executar os testes em bancos isolados com uma configuração local existente.

## CSV real e importação

O único arquivo inicial encontrado foi `ID_EEEM_MARIO__29311.csv`. Ele foi mantido intacto:

- 885 registros, 27 turmas, 24 colunas;
- codificação Windows-1252, separador `;`;
- identificador: **`id`**;
- nome: **`Aluno: Nome`**;
- turma: **`Turma: Nome`**;
- série / ano escolar: **`Ano de escolaridade: Nome`**, agora disponível como mapeamento opcional;
- não há coluna de nome social; `Aluno: INEP` é uma coluna adicional e não substitui o `id` sugerido;
- SHA-256: `5ec85d23bfdeb77cbf87a8593fb85880e66bda4663b7bcc9d099b0a709449c85`.

Depois de entrar, abra **Importar estudantes**, envie o CSV, confirme o mapeamento sugerido e clique em **Conferir prévia**. A prévia é paginada e filtrável por situação; mostra somente os campos escolares selecionados. Clique em **Importar registros prontos** para gravar.

O identificador é armazenado como texto, preservando zeros à esquerda. Linhas com campos obrigatórios vazios, caracteres inválidos ou quantidade incorreta de colunas são ignoradas. Identificadores repetidos no arquivo ou existentes na escola são ignorados. Mesmo nome e turma com outro identificador são sinalizados como possível duplicidade e também ignorados para revisão. Reimportar o CSV original não duplica os 885 cadastros. Identificador existente com dados diferentes não sobrescreve automaticamente um estudante: confira em **Turmas e estudantes → Editar**. Nome social é opcional e pode ser informado no cadastro.

O upload fica temporariamente na sessão privada do PHP para permitir o mapeamento. É removido da sessão ao concluir a importação ou sair. Não há cópia permanente do CSV enviada pelo navegador; endereços, telefones, dados de responsáveis, CPF, filiação etc. não entram nas tabelas de estudantes. Configure sessões PHP em diretório privado e coleta de sessões expiradas no servidor.

## Várias turmas ou uma série inteira

Em **Novo simulado → Aplicar para**, escolha **Uma ou mais turmas** e marque as turmas, ou escolha **Toda uma série / ano escolar**. No segundo modo, o servidor inclui todos os estudantes das turmas cadastradas naquela série; no primeiro, é possível conferir e selecionar participantes individualmente.

A série não é adivinhada pelo nome da turma. Na importação, relacione a coluna `Ano de escolaridade: Nome` à série. Para turmas já importadas, abra **Turmas e estudantes → Abrir turma → Definir série**. Use exatamente o mesmo nome de série nas turmas que devem ser agrupadas. Também é possível reimportar o CSV com a coluna de série: a prévia informa quantas turmas sem série serão completadas, e a confirmação não duplica os estudantes. Séries conflitantes precisam de conferência antes da importação.

A turma de participação é registrada ao incluir o estudante no simulado. Uma mudança posterior no cadastro não altera a turma dos resultados históricos. O relatório apresenta o total do simulado e a comparação entre as turmas participantes; o CSV identifica a turma de cada estudante.

## Criar e aplicar uma avaliação

1. Em **Novo simulado**, informe nome, data, uma ou mais turmas (ou a série inteira) e 2 a 5 alternativas (padrão A–E).
2. Mantenha uma disciplina para uma prova simples ou adicione várias áreas. Estão sugeridas Linguagens, Ciências Humanas, Ciências da Natureza e Matemática. Nomes personalizados são aceitos. As quantidades podem ser diferentes.
3. Selecione os participantes importados. Clique em **Montar gabarito**, preencha todas as questões e crie o simulado. Depois de criar, use **Editar gabarito / anular** para corrigir alternativas ou anular questões para todos. As respostas originais são preservadas e todos os resultados completos são recalculados, sem reimprimir os cartões.
4. Clique em **Gerar modelo reutilizável** e abra a impressão. Imprima uma matriz e tire as cópias necessárias: **o mesmo QR pode ser usado para vários estudantes**. Reabrir a impressão mantém o mesmo modelo e os mesmos QR codes. As respostas são reconhecidas separadamente em cada folha preenchida e salvas para o aluno selecionado. Não há lançamento automático da mesma resposta para toda a turma.
5. Em **PNG / imprimir**, o formato padrão é **Compacto para a capa**. Baixe o PNG em 300 ou 600 dpi e insira na capa no tamanho indicado, mantendo a proporção. Cada bloco contém até 60 questões; provas maiores usam até quatro blocos do mesmo modelo, com QR próprio por bloco. A opção **Folha A4 tradicional** permanece disponível; para impressão direta, use papel branco, escala 100% e sem cabeçalhos/rodapés. O QR tem somente um token aleatório de 128 bits, relacionado ao modelo e ao simulado no servidor. Cada estudante precisa preencher sua própria cópia.
6. O estudante preenche as bolhas com caneta de cor nítida. Identifique o estudante na própria capa da prova: o cartão não contém campo para nome. Depois da leitura, o professor seleciona o cadastro ao qual deve associar o resultado; não há reconhecimento de nome por OCR.

Limites atuais: 240 questões e 30 áreas. Há um modelo reutilizável por simulado. Um simulado pode incluir uma ou várias turmas, participantes selecionados ou todos os estudantes de uma série. Não há preenchimento automático de gabarito nem resultados inventados.

Cartões individuais gerados na versão anterior continuam válidos e mantêm seu funcionamento original de um aluno por conjunto. Para compartilhar o QR em um simulado antigo, abra-o e gere o novo modelo reutilizável. A atualização do banco é automática e preserva cadastros, gabaritos, cartões e resultados existentes; não é necessário reinstalar o sistema.

## Gabarito, anulações e notas

Abra o simulado e use **Editar gabarito / anular**. Altere a alternativa correta ou marque **Anular para todos** na questão. **Salvar e recalcular** atualiza todas as correções completas. Desmarcar a anulação restaura a correção pela marca original. Não altera QR, números/áreas/quantidade das questões ou medições lidas. Se outra pessoa tiver editado a mesma versão, reabra a tela antes de salvar.

Uma resposta errada, em branco ou múltipla vale zero e permanece válida. Anular é uma decisão global: **todos recebem o ponto da questão**, inclusive quem a deixou em branco. O sistema registra esse ponto como crédito separado dos acertos efetivos, evitando inflar a contagem de respostas que o aluno acertou. Exemplo genérico: 6 acertos, 3 erros e 1 anulada em 10 questões dão 6 acertos + 1 crédito = 70%. Isso não é nota TRI.

Em **Configurar notas**, ative o cálculo por faixas e escolha:

- **Uma nota pela prova inteira**: uma regra por quantidade de acertos + créditos ou por percentual.
- **Uma nota por área e somar tudo**: uma regra independente por área; é possível misturar quantidade e percentual. A nota total soma os pontos das áreas.

Cadastre os limites e os pontos que sua escola usa. Faixas de quantidade são inclusivas: 0–5, depois 6–10. Faixas percentuais compartilham a fronteira: 0–50%, depois acima de 50 até 100%; exatamente 50% pertence à primeira faixa. O cálculo usa o percentual sem arredondar para decidir a faixa. Cubra de zero até o total ou 100%, sem lacunas/sobreposições; os pontos não podem diminuir nas faixas seguintes e aceitam até duas casas decimais. **Salvar e recalcular notas** atualiza os resultados existentes. Desativar as notas mantém acertos/correções e remove só os pontos por faixa.

Em **Ver resultados**, escolha **Série** e/ou **Turma**. O filtro vale para médias, estudantes, áreas, questões, distribuição, evolução, comparação de simulados e CSV. A série precisa estar cadastrada nas turmas; não é deduzida do nome. A exportação inclui acertos efetivos, erros, válidas, anulações, créditos, questões consideradas, nota e série.

### Atualizar uma instalação existente

Faça backup privado e consistente do SQLite antes de enviar o pacote. Substitua os arquivos de código com `dist/MarioProvas-hostinger.zip`, preservando `config.php` e `storage/`. A migração para a versão 2 é automática na primeira consulta ao banco; não reinstale nem substitua o banco. Resultados antigos passam a contar brancos/múltiplas como erros válidos, com recálculo do percentual; marcas, cartões e cadastros são preservados. Notas ficam desativadas até você configurar as faixas. Recarregue com Ctrl+F5; a versão dos recursos é `ui9` e o cache PWA é v9.

## Cartão compacto e PNG para a capa

Abra o simulado → **PNG / imprimir** → **Compacto para a capa** → **Baixar PNG** em cada bloco. O arquivo mostra somente o QR, as questões numeradas com suas alternativas e as quatro referências da câmera, sobre fundo branco. Não inclui nome do site, nome do simulado, resumo de quantidade/bloco, instruções, rodapé nem campo para nome. Essa apresentação também vale para as novas exportações A4. Os dados de organização permanecem na tela de download, fora da imagem e da impressão. O download é gerado no dispositivo, com metadados PNG de tamanho físico (`pHYs`) para 300/600 dpi. No Word/LibreOffice/Canva, insira a imagem original e confira a largura indicada; mantenha a proporção, não recorte as margens e evite recompressão ou capturas de tela.

Com cinco alternativas, os tamanhos são aproximadamente: 10 questões **8,64 × 6,2 cm**, 30 questões **8,64 × 11,8 cm**, 60 questões **16 × 11,8 cm**. A distribuição em até quatro colunas e a altura são calculadas pela quantidade efetiva de questões e alternativas; blocos finais não reservam espaço para 60 questões quando têm menos. O compacto de 60 questões ocupa cerca de **63% menos área** que o cartão anterior de 19 × 26,6 cm.

As bolhas conservam **4 mm de diâmetro** no tamanho recomendado, e o QR tem 20,8 mm mais sua margem branca. O compacto não é uma miniatura proporcional do A4: a grade foi reorganizada, o cabeçalho reduzido e as letras internas clareadas. Não diminua abaixo das dimensões indicadas: aumentar dpi melhora a imagem, mas não recupera contraste/foco perdido quando a impressão física fica pequena demais. Para avaliações acima de 60 questões, baixe todos os blocos e coloque-os na capa/páginas da prova mantendo suas dimensões e margens; cada bloco precisa ser lido para concluir o resultado.

O leitor reconhece automaticamente o compacto e os dois desenhos A4 anteriores pelas referências e contornos; os tokens e os registros existentes não são trocados. Não há migração de banco nesta atualização. Na câmera, enquadre **o cartão inteiro**, com as quatro referências, sem precisar mostrar toda a capa. Preserve espaço branco ao redor para que textos e desenhos da capa não encostem nas marcas ou no QR. Cartões em formatos diferentes podem ser usados para estudantes diferentes no mesmo simulado.

## Leitura rápida, enquadramento e cores

A leitura não exige caneta preta. O detector considera o contraste dos canais de cor e aceita preenchimento com cores nítidas, incluindo azul, vermelho, verde, roxo, rosa, laranja e amarelo. Foram verificados 14 tons em imagens digitais, com preservação de branco e marcações múltiplas. Preencha **a bolha inteira**. Não é possível garantir leitura de tinta invisível, quase branca, com brilho metálico ou sem contraste com o papel. Se aparecer marcação ambígua, reforce o preenchimento e recapture; as respostas não são digitadas.

O leitor mostra três etapas: **Identificar QR → Alinhar cartão → Ler respostas**. Se o QR já foi identificado e a segunda etapa não avança, mostre o cartão inteiro com as quatro marcas; aproximar apenas o QR não permite ler as respostas. O contorno verde acompanha o cartão reconhecido. Luz, foco, zoom e compensação de exposição aparecem quando a câmera informa suporte. O leitor começa **sem lanterna**, solicita foco/exposição/balanço de branco contínuos e calibra os pixels pelos quatro quadrados e pelo papel. O QR também recebe uma segunda tentativa com contraste realçado. Em **Ajustes da câmera**, use **Clarear a captura** se o aparelho oferecer esse controle. Escuridão sem contraste, desfoque e reflexos continuam exigindo outra captura; não há garantia de leitura em qualquer iluminação.

O QR mantém margem branca própria em todos os formatos. Basta reabrir a impressão do modelo para baixar o compacto, conservando o mesmo identificador. Os cartões já impressos em A4 continuam aceitos.

A busca do QR usa recortes e refinamento dos cantos. O processamento acontece em worker quando disponível, mantendo a interface livre; existe fallback local para navegadores sem worker. Duas capturas precisam concordar. A espera fixa de 550 ms foi removida. Depois de **Salvar e continuar**, retire a folha anterior: a câmera já procura o próximo cartão. Uma folha idêntica precisa sair do enquadramento antes de ser apresentada novamente para outro aluno.

Após atualizar os arquivos, use **Ctrl + F5** no computador. Recursos do leitor têm versão de URL e revalidação de cache para evitar carregar o código anterior. Em PWA, feche e reabra o app; a gravação continua dependendo de conexão e HTTPS.

## Testar a câmera com papel impresso

1. Em uma avaliação real autorizada, gere o modelo reutilizável e prepare duas cópias para dois estudantes participantes. Confira o gabarito antes da impressão.
2. Preencha algumas bolhas, deixe uma questão em branco e marque duas alternativas em outra. Anote a expectativa em papel para comparar depois.
3. No celular/tablet/computador, abra o simulado → **Ler cartões** → **Ativar câmera**. Só nesse momento o navegador solicita permissão. Use HTTPS; em localhost, o teste deve ser feito no mesmo computador.
4. Use a câmera traseira, se disponível, boa iluminação uniforme e folha plana sobre uma superfície sem desenhos. Deixe as quatro marcas dentro da imagem. Mantenha a câmera firme até duas capturas concordarem. É possível escolher outra câmera após autorizar o acesso.
5. Confira a contagem; a imagem alinhada e as alternativas ficam em **Conferir imagem e marcações**. Busque por nome, turma ou matrícula, selecione o estudante e toque em **Salvar e continuar**. A comparação com o gabarito e a gravação acontecem automaticamente. Não é possível digitar letras como alternativa à leitura.
6. Em provas multipágina, selecione o estudante em cada folha. O resultado de cada aluno só é criado quando todas as páginas do modelo forem lidas para ele. É possível intercalar páginas de alunos diferentes; as respostas permanecem separadas. Páginas parciais persistem no servidor e podem ser retomadas após sair.
7. Depois de salvar, retire a folha anterior do enquadramento e apresente a cópia do próximo estudante. A próxima leitura já está ativa; o botão **Próximo cartão** é opcional. O QR pode ser o mesmo. A câmera continua ativa. Ao sair da leitura, ocultar a página ou fechar a tela, as trilhas da câmera são encerradas. Ao voltar, reinicie a câmera.
8. Salvar a mesma página novamente para o mesmo estudante deve ser bloqueado, assim como criar dois resultados para o mesmo aluno no simulado. No modelo reutilizável, ler o mesmo QR para outro estudante é permitido. Alunos já corrigidos ou que já receberam aquela página não aparecem como opções pendentes no leitor. Um cartão de outro simulado deve ser rejeitado. QR desconhecido, enquadramento cortado, desfoque, sombra e preenchimento ambíguo não salvam a tentativa. Refaça a captura; não há digitação manual para contornar a falha.
9. Compare o resultado individual: branco e múltiplas devem aparecer como **incorretas**, dentro das válidas. Só o professor anula uma questão para todos. Cada anulação dá um crédito a todos: percentual = (acertos + créditos) / (válidas + créditos). Confira também uma alteração de gabarito, uma anulação e a reversão da anulação; os resultados devem ser recalculados sem nova leitura.

As imagens ficam na memória do dispositivo durante a leitura, não são enviadas nem armazenadas no servidor. São persistidas as medições de preenchimento por alternativa, o responsável pela leitura, a data e as respostas classificadas. Os parâmetros de qualidade não são prova criptográfica de captura: o professor autenticado continua responsável pela associação e conferência.

**Atualização ui9:** feche a tela de impressão/leitura e recarregue o site (Ctrl+F5 no computador) para carregar o gerador QR e os links atualizados. Baixe novamente o PNG para obter a apresentação limpa. Cartões anteriores continuam aceitos, sem reimpressão obrigatória. O contorno verde indica alinhamento aceito; âmbar indica que o cartão foi alinhado, mas as marcações precisam de nova captura. Se aparecer “bolhas pequenas demais”, aproxime o cartão preservando os quatro quadrados ou selecione uma câmera com resolução maior. Se houver preenchimento ambíguo, confira as questões indicadas. Uma captura rejeitada permanece sem resultado salvo.

## Resultados e relatórios

O resultado individual mostra acertos efetivos, erros, válidas, anulações do professor, créditos, percentual, nota, áreas e correção por questão. Brancos e múltiplas são razões de erro, sem anulação automática. Os créditos ficam separados dos acertos efetivos. Melhor/pior área considera o percentual com créditos, incluindo empates.

O relatório do simulado mostra média da quantidade de acertos, média dos percentuais individuais, média por área, distribuição em faixas, corretas/incorretas/brancas/múltiplas por questão, ordenação por índice de acerto, comparação entre as turmas participantes e entre simulados que compartilham turmas e evolução de cada estudante ao longo das datas de aplicação. Sem denominador calculável, não há percentual. Com todas as questões anuladas pelo professor, todos recebem 100% e os pontos da faixa máxima. As comparações não normalizam dificuldade nem composição da turma. As indicações pedagógicas apresentam os números e são formuladas como possibilidades de investigação.

**Exportar CSV / Excel** baixa CSV UTF-8 com BOM e separador `;`, organizado por simulado, data, turma, identificador, estudante, área e TOTAL. Abre no Excel; não é um arquivo `.xlsx`. Campos capazes de iniciar fórmulas são neutralizados. O nome social tem preferência no relatório e na exportação, sem remover o nome civil do cadastro privado.

## Acesso, backup e operação

Cada usuário pertence a uma escola. Toda consulta e mutação exige sessão e valida a escola do recurso. Professores autorizados compartilham os dados de **toda a escola**; não há recorte por professor/turma nesta versão. O administrador pode criar professores em **Equipe da escola**. Não há cadastro público. Contas de outra escola não conseguem consultar estudantes, provas, cartões, relatórios ou exportações. Senhas usam `password_hash`/`password_verify`; sessões têm HttpOnly, SameSite=Strict, Secure em HTTPS, rotação no login e expiração por inatividade de duas horas. Há CSRF, limite de tentativas de login, queries preparadas, restrições de unicidade e log de eventos sem nomes de estudantes.

Defina a política de retenção da escola e faça backups criptografados fora do document root. Para obter uma cópia SQLite consistente, execute `php scripts/backup.php CAMINHO_PRIVADO_DESTINO.sqlite` durante a operação normal, ou interrompa as escritas e copie o banco com os arquivos WAL/SHM correspondentes. Teste a restauração antes de depender do backup. Atualizar o código não deve substituir `config.php` nem `storage/`.

## Verificações e limites

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run test:omr
python tests/integration.py
python tests/migration.py
C:\xampp\php\php.exe scripts/check.php
```

Node e Python são necessários **somente para desenvolvimento/testes**, não para servir a aplicação. Em Linux use `npm` e ajuste `PHP_BIN` se necessário. As dependências de teste são fixadas no lockfile. Se o CSV original não estiver mais na pasta, a integração usa os cadastros reais da base local apenas como fonte de leitura e monta o CSV de teste em memória. Todas as importações e correções de teste acontecem em SQLite temporário. O teste de migração também usa uma cópia privada da base existente, sem atualizar a origem. Veja [docs/VERIFICACAO.md](docs/VERIFICACAO.md) para a evidência e os limites de validação.

A integração também verifica a exportação em Chrome/Edge headless quando o executável está disponível; use `MARIOPROVAS_CHROME` para indicar outro caminho. Esse teste usa perfil temporário, login e banco de testes, baixa o PNG de verdade e produz capturas desktop/celular em `tests/artifacts/`. Não aciona a câmera física e não é necessário Chrome no servidor de produção.

O reconhecimento óptico é implementado e testado sobre imagens rasterizadas com QR real e bolhas reais nos pixels, incluindo perspectiva. **Isso não equivale a homologação com câmera física, impressão, luz e dispositivos da escola.** Faça o roteiro de papel acima antes do uso em uma aplicação de prova. Tinta muito clara, rasuras, folhas curvadas, impressões distorcidas e iluminação irregular podem exigir nova leitura. Não há promessa de leitura de cartões externos ou reconhecimento de X, tiques ou letras manuscritas nas bolhas.

Não há TRI/nota oficial do ENEM, uso offline de dados, recuperação de senha por e-mail, MFA, exclusão/restauração pela interface, transferência de um conjunto já vinculado. Uma associação incorreta já salva exige intervenção técnica com backup e auditoria; confira o estudante antes de salvar. SQLite é de instância única e escrita serializada; para muitas escolas concorrentes em vários servidores, será necessária migração planejada para banco cliente/servidor. O ZIP é uma entrega para instalação: nenhum deploy na conta Hostinger foi feito sem acesso à hospedagem.
