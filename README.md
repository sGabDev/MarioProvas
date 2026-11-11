# MarioProvas

Aplicação implementada do zero para organizar estudantes, criar simulados, imprimir cartões, reconhecer **marcações no papel** e acompanhar resultados. Os dados ficam em SQLite no servidor. Não há estudantes, provas ou resultados de demonstração na base da aplicação.

## Tecnologias e requisitos

- **PHP 8.2+ e PDO SQLite**: instalação simples em hospedagem PHP, transações e persistência em arquivo privado. SQLite atende ao uso escolar em uma única instância; não requer processo Node nem Composer na hospedagem.
- **JavaScript nativo, Canvas e getUserMedia**: interface responsiva e processamento óptico no próprio dispositivo. jsQR 1.4.0 decodifica QR; qrcode-generator 1.4.4 gera QR. As bibliotecas e licenças estão em `public/assets/vendor/`, sem CDN em tempo de execução.
- **OMR próprio**: localização das quatro referências, homografia, reamostragem da imagem, medição do preenchimento das bolhas, controle de contraste/desfoque e confirmação em duas capturas concordantes.
- **PWA** com manifesto, ícones e service worker. O cache contém somente recursos públicos e uma página offline. Dados escolares, imagens, cartões e APIs não são armazenados no cache da PWA. Não usa localStorage como banco.

Extensões necessárias: `pdo_sqlite`, `mbstring`, `session`, `json`. O diretório privado `storage/` deve permitir escrita ao PHP. `upload_max_filesize` deve aceitar 8 MB e `post_max_size` pelo menos 10 MB. `memory_limit` recomendado: 128 MB ou mais. Ative HTTPS antes de usar a câmera fora de localhost.

## Executar no computador

No PowerShell, dentro deste projeto:

```powershell
C:\xampp\php\php.exe scripts/check.php
C:\xampp\php\php.exe install.php
C:\xampp\php\php.exe -S localhost:8080 -t public
```

O instalador solicita escola, nome, e-mail e senha do primeiro administrador. A senha deve ter de 12 a 200 caracteres. A entrada no instalador CLI é visível no terminal; para entrada mascarada, use a instalação web abaixo. A instalação só pode acontecer uma vez por banco. Abra **http://localhost:8080**. Com Apache/XAMPP, também pode abrir a pasta `public/` deste projeto, conforme o seu VirtualHost.

Não inicie o servidor embutido do PHP na raiz do projeto: ele não interpreta `.htaccess`. Use sempre `-t public`.

## Instalar na Hostinger

Use hospedagem **PHP**, não um plano restrito ao construtor visual. Confira a disponibilidade do PDO SQLite no seu plano e versão de PHP. No hPanel, as extensões e opções são gerenciadas na configuração do PHP; veja a [documentação oficial da Hostinger](https://www.hostinger.com/br/support/4667515-como-gerenciar-extensoes-e-opcoes-do-php-no-hpanel-hostinger/).

1. Envie o conteúdo de `dist/MarioProvas-hostinger.zip` e extraia preservando a estrutura. O pacote não inclui CSV, banco, credenciais nem dados reais.
2. **Preferível:** configure o document root do domínio/subdomínio para a pasta `public/`; mantenha `app/`, `storage/` e `config.php` fora desse document root. Se seu plano fixa a pasta `public_html`, use a estrutura do pacote dentro de `public_html` e acesse `https://seu-dominio/public/`. O `.htaccess` da raiz bloqueia arquivos e pastas privados. Não remova esses bloqueios.
3. Ative PHP 8.2+ com as extensões indicadas, ajuste o upload e dê permissão de escrita ao PHP somente em `storage/`. Não use permissão 777. Se houver SSH, execute `php scripts/check.php` e `php install.php` na raiz da aplicação.
4. **Sem SSH:** copie `config.example.php` para `config.php`, ao lado de `app/`. Defina `setup_key` com uma chave aleatória de pelo menos 32 caracteres. Abra o site e complete “Prepare sua escola” usando essa chave. Não existe senha padrão nem cadastro público. Depois de instalar, esvazie `setup_key` no arquivo e guarde o `config.php` privado. O banco impede nova instalação mesmo que a chave continue configurada.
5. Ative o certificado SSL e o redirecionamento HTTP → HTTPS no painel da hospedagem. Acesse o endereço HTTPS definitivo antes de instalar a PWA. A câmera depende de contexto seguro ([documentação de getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)). Um IP da rede local servido por HTTP não é equivalente a localhost.
6. Desative cache de página/CDN para `api.php`, páginas autenticadas e impressão. O projeto envia `Cache-Control: no-store, private`. Preserve cookies de sessão e cabeçalhos de segurança. Para Nginx ou servidores que ignoram `.htaccess`, exponha **somente `public/`** e implemente os cabeçalhos equivalentes.
7. Teste sem autenticação: os endereços do CSV, `storage/`, `app/` e `config.php` devem retornar 403/404; a API não deve fornecer dados. Faça backup privado antes de colocar dados em uso.

O caminho do banco pode ser alterado em `config.php`. O padrão é `storage/marioprovas.sqlite`. O banco usa WAL; a pasta inteira precisa ser gravável. Variáveis de ambiente `MARIOPROVAS_DB` e `MARIOPROVAS_SETUP_KEY` são alternativas quando não há configuração explícita no arquivo.

## CSV real e importação

O único arquivo inicial encontrado foi `ID_EEEM_MARIO__29311.csv`. Ele foi mantido intacto:

- 885 registros, 27 turmas, 24 colunas;
- codificação Windows-1252, separador `;`;
- identificador: **`id`**;
- nome: **`Aluno: Nome`**;
- turma: **`Turma: Nome`**;
- não há coluna de nome social; `Aluno: INEP` é uma coluna adicional e não substitui o `id` sugerido;
- SHA-256: `5ec85d23bfdeb77cbf87a8593fb85880e66bda4663b7bcc9d099b0a709449c85`.

Depois de entrar, abra **Importar estudantes**, envie o CSV, confirme o mapeamento sugerido e clique em **Conferir prévia**. A prévia é paginada e filtrável por situação; mostra somente os campos escolares selecionados. Clique em **Importar registros prontos** para gravar.

O identificador é armazenado como texto, preservando zeros à esquerda. Linhas com campos obrigatórios vazios, caracteres inválidos ou quantidade incorreta de colunas são ignoradas. Identificadores repetidos no arquivo ou existentes na escola são ignorados. Mesmo nome e turma com outro identificador são sinalizados como possível duplicidade e também ignorados para revisão. Reimportar o CSV original não duplica os 885 cadastros. Identificador existente com dados diferentes não sobrescreve automaticamente um estudante: confira em **Turmas e estudantes → Editar**. Nome social é opcional e pode ser informado no cadastro.

O upload fica temporariamente na sessão privada do PHP para permitir o mapeamento. É removido da sessão ao concluir a importação ou sair. Não há cópia permanente do CSV enviada pelo navegador; endereços, telefones, dados de responsáveis, CPF, filiação etc. não entram nas tabelas de estudantes. Configure sessões PHP em diretório privado e coleta de sessões expiradas no servidor.

## Criar e aplicar uma avaliação

1. Em **Novo simulado**, informe nome, data, turma e 2 a 5 alternativas (padrão A–E).
2. Mantenha uma disciplina para uma prova simples ou adicione várias áreas. Estão sugeridas Linguagens, Ciências Humanas, Ciências da Natureza e Matemática. Nomes personalizados são aceitos. As quantidades podem ser diferentes.
3. Selecione os participantes importados. Clique em **Montar gabarito**, preencha todas as questões e crie o simulado. O gabarito é fixo após a criação para não invalidar cartões ou resultados existentes.
4. Gere os conjuntos de cartões e abra a impressão do lote. É possível reimprimir o mesmo conjunto na tabela. **Uma reimpressão conserva o QR e não permite uma segunda correção.** Gere outro conjunto apenas para outro estudante.
5. Imprima em A4 branco, escala 100%, sem cabeçalhos/rodapés. Cada folha contém até 60 questões; provas maiores usam até quatro folhas do mesmo conjunto. Guarde essas folhas juntas. O QR tem somente um token aleatório de 128 bits, relacionado ao conjunto e ao simulado no servidor.
6. O estudante escreve o nome no campo impresso e preenche as bolhas com caneta preta. O nome manuscrito não é reconhecido por OCR: serve à conferência do professor ao selecionar o cadastro depois da leitura.

Limites atuais: 240 questões, 30 áreas e 200 conjuntos por lote de geração. Um simulado pode incluir toda a turma ou parte dela. Não há preenchimento automático de gabarito nem resultados inventados.

## Testar a câmera com papel impresso

1. Em uma avaliação real autorizada, gere um conjunto para um estudante participante. Confira o gabarito antes da impressão.
2. Preencha algumas bolhas, deixe uma questão em branco e marque duas alternativas em outra. Anote a expectativa em papel para comparar depois.
3. No celular/tablet/computador, abra o simulado → **Ler cartões** → **Ativar câmera**. Só nesse momento o navegador solicita permissão. Use HTTPS; em localhost, o teste deve ser feito no mesmo computador.
4. Use a câmera traseira, se disponível, boa iluminação uniforme e folha plana sobre uma superfície sem desenhos. Deixe as quatro marcas dentro da imagem. Mantenha a câmera firme até duas capturas concordarem. É possível escolher outra câmera após autorizar o acesso.
5. Confira a imagem alinhada e as marcações reconhecidas. Selecione o estudante pelo nome e identificador e toque em **Salvar para este estudante**. A comparação com o gabarito e a gravação acontecem automaticamente. Não é possível digitar letras como alternativa à leitura.
6. Em provas multipágina, a primeira folha vincula o conjunto; as demais exigem o mesmo estudante. O resultado só é criado quando todas as folhas forem lidas. Páginas parciais persistem no servidor e podem ser retomadas após sair.
7. Toque em **Próximo cartão** para continuar com a mesma câmera. Ao sair da leitura, ocultar a página ou fechar a tela, as trilhas da câmera são encerradas. Ao voltar, reinicie a câmera.
8. Tente reler a mesma folha: deve aparecer aviso de cartão já processado. Tente um cartão de outro simulado: deve ser rejeitado. QR desconhecido, enquadramento cortado, desfoque, sombra e preenchimento ambíguo não salvam a tentativa. Refaça a captura; não há digitação manual para contornar a falha.
9. Compare o resultado individual: branco e múltiplas devem aparecer como anuladas; percentual = acertos / válidas. Nenhuma válida significa percentual **não calculável**, e não 0%.

As imagens ficam na memória do dispositivo durante a leitura, não são enviadas nem armazenadas no servidor. São persistidas as medições de preenchimento por alternativa, o responsável pela leitura, a data e as respostas classificadas. Os parâmetros de qualidade não são prova criptográfica de captura: o professor autenticado continua responsável pela associação e conferência.

## Resultados e relatórios

O resultado individual mostra acertos, válidas, anuladas, percentual, áreas, melhor/pior área (incluindo empates), e classificação de cada questão. Sem área com questões válidas, não determina melhor/pior.

O relatório da turma mostra média da quantidade de acertos, média dos percentuais individuais, média por área, distribuição em faixas, corretas/incorretas/brancas/múltiplas por questão, ordenação por índice de acerto, comparação entre simulados da mesma turma e evolução de cada estudante ao longo das datas de aplicação. Estudantes sem nenhuma válida não entram na média percentual. As comparações não normalizam dificuldade nem composição da turma. As indicações pedagógicas apresentam os números e são formuladas como possibilidades de investigação.

**Exportar CSV / Excel** baixa CSV UTF-8 com BOM e separador `;`, organizado por simulado, data, turma, identificador, estudante, área e TOTAL. Abre no Excel; não é um arquivo `.xlsx`. Campos capazes de iniciar fórmulas são neutralizados. O nome social tem preferência no relatório e na exportação, sem remover o nome civil do cadastro privado.

## Acesso, backup e operação

Cada usuário pertence a uma escola. Toda consulta e mutação exige sessão e valida a escola do recurso. Professores autorizados compartilham os dados de **toda a escola**; não há recorte por professor/turma nesta versão. O administrador pode criar professores em **Equipe da escola**. Não há cadastro público. Contas de outra escola não conseguem consultar estudantes, provas, cartões, relatórios ou exportações. Senhas usam `password_hash`/`password_verify`; sessões têm HttpOnly, SameSite=Strict, Secure em HTTPS, rotação no login e expiração por inatividade de duas horas. Há CSRF, limite de tentativas de login, queries preparadas, restrições de unicidade e log de eventos sem nomes de estudantes.

Defina a política de retenção da escola e faça backups criptografados fora do document root. Para obter uma cópia SQLite consistente, execute `php scripts/backup.php CAMINHO_PRIVADO_DESTINO.sqlite` durante a operação normal, ou interrompa as escritas e copie o banco com os arquivos WAL/SHM correspondentes. Teste a restauração antes de depender do backup. Atualizar o código não deve substituir `config.php` nem `storage/`.

## Verificações e limites

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run test:omr
python tests/integration.py
C:\xampp\php\php.exe scripts/check.php
```

Node e Python são necessários **somente para desenvolvimento/testes**, não para servir a aplicação. Em Linux use `npm` e ajuste `PHP_BIN` se necessário. As dependências de teste são fixadas no lockfile. Veja [docs/VERIFICACAO.md](docs/VERIFICACAO.md) para a evidência e os limites de validação.

O reconhecimento óptico é implementado e testado sobre imagens rasterizadas com QR real e bolhas reais nos pixels, incluindo perspectiva. **Isso não equivale a homologação com câmera física, impressão, luz e dispositivos da escola.** Faça o roteiro de papel acima antes do uso em uma aplicação de prova. Caneta fraca, rasuras, folhas curvadas, impressões distorcidas e iluminação irregular podem exigir nova leitura. Não há promessa de leitura de cartões externos ou reconhecimento de X, tiques ou letras manuscritas nas bolhas.

Não há TRI/nota oficial do ENEM, uso offline de dados, recuperação de senha por e-mail, MFA, exclusão/restauração pela interface, mudança de gabarito após criar a prova ou transferência de um conjunto já vinculado. Uma associação incorreta já salva exige intervenção técnica com backup e auditoria; confira o estudante antes de salvar. SQLite é de instância única e escrita serializada; para muitas escolas concorrentes em vários servidores, será necessária migração planejada para banco cliente/servidor. O ZIP é uma entrega para instalação: nenhum deploy na conta Hostinger foi feito sem acesso à hospedagem.
