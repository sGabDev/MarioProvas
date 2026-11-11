# Interface e responsividade — ui9

Refatoração de 11/11/2026. Escopo: apresentação e acessibilidade do MarioProvas. APIs, banco, regras de correção/notas, importação, QR e geometria dos cartões foram preservados.

## Diagnóstico e solução

| Problema encontrado | Correção aplicada |
|---|---|
| CSS concentrado em linhas extensas, com 52 seletores repetidos na aplicação e 44 no leitor, incluindo ajustes contraditórios | Estilos reescritos por responsabilidade, base móvel e ampliações progressivas. As repetições necessárias por breakpoint permanecem explícitas. |
| Fontes de 9–13 px no leitor e campos menores que 16 px | Texto auxiliar a partir de 12 px, texto de interface de 14–16 px e campos de 16 px em todos os tamanhos. |
| Menu móvel sem fechamento externo, Escape ou isolamento de foco | Gaveta com botão fechar, fundo clicável, `inert`, `aria-expanded`, retorno de foco e ciclo de Tab/Shift+Tab. |
| Modais limitados por alturas fixas/`vh`, sem áreas seguras | Limites pela viewport visual, rolagem interna, `dvh`/`svh` com fallback e `safe-area-inset-*`. Altura reduzida não remove conteúdo. |
| Cabeçalhos/tabelas largos e textos que forçavam a página | `minmax(0,1fr)`, limites intrínsecos, quebra de texto e rolagem dentro da tabela. Cabeçalhos quebram entre palavras. |
| Rótulo visualmente oculto de tabela ampliava a página no WebKit e provocava ajuste automático de escala no Chrome móvel | Contenção e posicionamento do rótulo corrigidos na origem, sem ocultar overflow global. |
| Tabelas de resultados densas no telefone | Resultados individuais em cartões, preservando cabeçalhos/semântica de tabela. Análises com muitas colunas mantêm rolagem localizada, indicação visual e acesso por teclado. |
| Espaçamentos constantes espalhados nos templates | Classes reutilizáveis substituem os estilos inline constantes. Medidas calculadas de gráficos, cartão/SVG, guia da câmera e cores indicativas permanecem dinâmicas. |
| Estilos da página offline com versões diferentes das URLs pré-carregadas | PWA v9 guarda as URLs exatas dos estilos `ui9`, incluindo os tokens. Página offline conferida sem rede. |

## Organização e arquivos

| Arquivo | Responsabilidade |
|---|---|
| `public/assets/tokens.css` — novo | Cores da marca, contraste de texto, escala de espaços/fontes, bordas, sombras, toque, áreas seguras e fallback de altura. |
| `public/assets/app.css` | Base, navegação, layout, cards, formulários, tabelas, gráficos, login, relatórios, gabarito, notas e modais. |
| `public/assets/scanner.css` | Leitor, vídeo, guia, estados, revisão, controles e adaptação à orientação horizontal. |
| `public/assets/print.css` | Ferramentas de impressão/PNG e apresentação em tela. Tamanhos físicos e SVG preservados na impressão. |
| `public/assets/ui.mjs` — novo | Navegação/foco, viewport visual, identificação dos modais, tabelas roláveis por teclado e semântica dos resultados em cartões. Não consulta APIs nem grava dados. |
| `public/assets/app.mjs` | Integração dos recursos de interface, markup do menu e remoção de estilos inline constantes. Fluxos e requisições existentes preservados. |
| `public/assets/audience.mjs` | Classes de espaçamento/apresentação nos seletores de turmas, série e participantes. |
| `public/index.php`, `public/print.html`, `public/offline.html` | Carregamento dos tokens/estilos e viewport com áreas seguras. |
| `public/sw.js` | Cache público v9 com URLs de estilos correspondentes à interface. Não guarda APIs escolares. |
| `tests/responsive-browser.mjs` — novo | Matriz de telas, toque, teclado, áreas seguras simuladas, vídeo óptico controlado e offline. |
| `tests/integration.py`, `tests/routes.py` | Integração opcional da matriz, sessão privada de QA e conferência das versões dos recursos. |
| `README.md`, `docs/VERIFICACAO.md`, este documento | Operação, evidências e limites de validação. |

Somente versões de importação/cache foram atualizadas em `assessment-view.mjs`, `cards-view.mjs`, `report-view.mjs`, `print.mjs`, `omr.mjs`, `scan-engine.mjs`, `scan-worker.mjs` e `scanner.mjs`. Nenhum algoritmo desses módulos mudou nesta refatoração. O ZIP de instalação é gerado novamente em `dist/`.

## Regras do design system

- Base móvel de uma coluna; Grid e Flex reorganizam componentes sem larguras mínimas que ultrapassem o painel. Cards e campos usam consultas ao container quando há espaço.
- Ampliações em 40 rem (faixas de nota), 48 rem (indicadores, filtros e tabelas de resultados), 64 rem (navegação lateral fixa e leitor em colunas) e 75 rem (painéis em duas colunas).
- Alvos principais com pelo menos 44 × 44 px. Checkboxes mantêm tamanho nativo confortável dentro de rótulos clicáveis maiores. Inputs não encolhem no telefone.
- Áreas seguras aplicadas à aplicação, menu, impressão, notificações e modais. `visualViewport` acompanha a área disponível sem desativar o zoom do usuário. Há fallback CSS quando a API não existe.
- Estados de foco por teclado, contraste reforçado nos textos auxiliares, semântica das tabelas e redução de movimento. `!important` fica restrito ao estado nativo `hidden` e à preferência de movimento reduzido.
- Não existe `overflow-x:hidden` global. O bloqueio de rolagem durante menu/modal é um estado de interação, não uma correção de largura.

## Verificações executadas

- **Chrome/Chromium 157.0.8103.39: 2.604 verificações aprovadas.**
- **WebKit 26.5: 2.495 verificações aprovadas.** Esse motor foi executado em Windows; não equivale ao Safari instalado em um iPhone.
- Larguras: **320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440 e 1920 px**. Também 568 × 320, 844 × 390, 1024 × 600 e 390 × 440; viewport de formulário reduzida para 390 × 380; áreas seguras simuladas em orientação horizontal.
- Estados: login, formulário de instalação, painel, simulados, turmas, estudantes, importação/mapeamento/prévia, criação e gabarito, aplicação, editores de notas e gabarito, leitor, relatórios/filtros, resultado individual, equipe, ajuda, impressão compacta/A4 e página offline.
- A matriz verifica largura real da viewport (inclusive ampliação indevida pelo conteúdo), overflow da página, campos de 16 px, alvos de toque, sobreposição entre componentes, controles cortados e limites dos modais.
- Interações: toque no menu/fechamento/fundo/navegação, Escape, ciclo Tab/Shift+Tab do menu, foco e Tab no dialog, rolagem horizontal por teclado, filtro/limpeza, campo/ação acessível com altura reduzida e redução de movimento.
- No Chrome, a revisão do leitor também foi conferida com vídeo produzido por `canvas.captureStream`: cartão gerado pelos módulos reais, QR da API temporária e reconhecimento óptico de verdade. Nenhum resultado foi salvo por essa matriz; não foi usada câmera física.
- Página offline carregada com a rede desativada no Chrome; tokens/layout disponíveis no cache e ausência de APIs no Cache Storage. Nas matrizes geométricas, o service worker é bloqueado para evitar interferência no teste de estados; o teste offline usa outro contexto com o worker habilitado.
- **51 testes ópticos/do motor**, **54 verificações de integração**, fluxo DOM, exportação real no Chrome, **30 verificações Apache**, migração idempotente em cópia privada, requisitos PHP, sintaxe Apache e análise de sintaxe de 13 arquivos PHP/17 módulos e scripts JS aprovados.
- Capturas de painel, criação, turmas e relatórios em 390/1440 px, além de login e modais, inspecionadas visualmente. Dados pessoais são substituídos somente no DOM das capturas; fundos atrás dos dialogs são ocultados. A base e as respostas da API não são alteradas para produzir imagens. Artefatos e bancos de QA não entram no pacote Hostinger.

## Reproduzir

Os testes continuam usando bancos temporários. Não execute testes apontando para o banco escolar em uso.

```powershell
npm.cmd run test:omr
python tests/integration.py
python tests/migration.py
python tests/routes.py

# Matriz no Chrome instalado; Playwright precisa estar disponível no ambiente.
$env:MARIOPROVAS_RESPONSIVE = '1'
python tests/integration.py

# Repete no motor WebKit já instalado para o mesmo Playwright.
$env:MARIOPROVAS_BROWSER_ENGINE = 'webkit'
python tests/integration.py
Remove-Item Env:MARIOPROVAS_RESPONSIVE, Env:MARIOPROVAS_BROWSER_ENGINE
```

`MARIOPROVAS_PLAYWRIGHT` aceita o caminho de um módulo Playwright existente; `MARIOPROVAS_CHROME` aceita outro executável Chrome/Edge. O script procura a ferramenta já disponível no ambiente de desenvolvimento e informa **SKIP** se ela faltar. Playwright/navegadores de teste não são dependências de produção, não foram incluídos no projeto/ZIP e não são necessários na Hostinger. O motor WebKit foi disponibilizado no cache local de ferramentas para esta execução.

Para iterar QA, `MARIOPROVAS_QA_SESSION` pode apontar para um arquivo `marioprovas-qa-*.json` na pasta temporária do sistema. A integração mantém o servidor de teste até esse arquivo ser removido. Ele contém credenciais exclusivamente efêmeras do banco temporário e deve ser removido ao terminar. Essa opção não é usada pelo produto.

## Limites e atualização

Não houve testes em aparelhos Android/iOS físicos, teclado nativo do Safari/Chrome móvel, notch real, instalação da PWA no dispositivo ou impressão física. Emulação de toque, viewport reduzida e WebKit cobrem renderização/interação automatizada; continuam necessários testes de campo no aparelho e na impressão da escola. Não foi feita auditoria completa de conformidade WCAG, teste com leitor de tela físico ou deploy na Hostinger.

Para atualizar, faça backup e envie `dist/MarioProvas-hostinger.zip` à mesma instalação, preservando `config.php` e `storage/`. Não é necessária migração nova de banco nesta entrega de interface. Recarregue com Ctrl+F5; feche/reabra a PWA para carregar `ui9`/cache v9.
