# Registro de verificação — 10/11/2026

## Leitor atualizado em 11/11/2026 — cores, QR e agilidade

- **24 testes ópticos aprovados**: os sete cenários anteriores mais preenchimentos em 14 cores/tons (preto, azul, vermelho, verde, roxo, rosa, laranja, amarelo, ciano, marrom, cinza, rosa claro, amarelo claro e cinza claro), QR menor dos cartões antigos, leitura em resolução menor com folha deslocada, recorte da última posição e QR com baixo contraste. Em todos os testes de tinta, branco e múltiplas continuam separados.
- **3 testes do motor aprovados**: protocolo de mensagens executado em worker real, fallback sem worker e medição de capturas consecutivas. O harness Node adapta somente o ambiente do worker; o decodificador QR e o OMR são os módulos de produção.
- As **35 verificações de integração** continuam aprovadas. O teste DOM da interface também passou com busca por matrícula, foco contínuo solicitado quando suportado, comandos de luz/zoom, salvamento e retomada automática sem clicar em Próximo cartão, bloqueio da folha anterior e dois resultados usando o mesmo QR. A câmera deste teste continua sendo uma fonte de pixels controlada, sem dispositivo físico.
- Medição local, cartão digital de 60 questões em 1000 × 1400 px: mediana de aproximadamente **80 ms por captura consecutiva** incluindo QR e OMR, após aquecimento. A etapa OMR passou de cerca de 53 ms para 35 ms. Esses números não incluem tempo de foco, permissão, exposição, movimentação do papel ou rede e não são promessa de desempenho no celular. A espera fixa anterior de 550 ms entre tentativas foi removida.
- O QR nas novas impressões cresceu de 132 para 160 unidades, com margem branca de quatro módulos. O leitor aceita ambas as geometrias e refina os cantos em recorte de resolução original. A identificação do simulado e a validação de duplicidade no servidor permanecem.
- O detector usa o canal de cor mais escuro com realce de saturação e preenchimento local. Não há exigência de caneta preta. Tinta invisível, quase branca, metálica/reflexiva ou sem contraste com o papel pode continuar exigindo nova leitura. Não foi feita homologação com todas as tintas físicas do mercado.
- A tela foi reorganizada em câmera com guia de folha inteira, etapas de progresso, painel de aluno, busca, contadores e confirmação compacta. A análise usa worker em navegadores compatíveis e mantém duas capturas concordantes. O desenho da folha e as alternativas não precisam ser digitados.
- Houve nova tentativa de inspeção visual pelo adaptador do Chrome; as janelas minimizadas não puderam ser capturadas, e o conector de abas continuou indisponível. Assim, esta atualização não declara inspeção visual interativa ou captura com câmera física concluída.

## Atualização de 11/11/2026 — várias turmas e QR reutilizável

- Os 7 testes ópticos continuam aprovados, sem alteração no reconhecimento das bolhas.
- A integração ampliada passou em **35 verificações**, incluindo um simulado de duas turmas, seleção de série inteira no servidor, mapeamento da série pelo CSV, preenchimento de série na reimportação sem duplicar alunos, QR compartilhado por dois estudantes com respostas diferentes, páginas intercaladas, bloqueio de página/resultados repetidos para o mesmo estudante, comparação por turma e exportação com turma individual.
- O teste da interface DOM criou uma avaliação para duas turmas, conferiu o modo série, leu duas cópias com o mesmo QR para alunos diferentes, salvou dois resultados e manteve apenas uma ativação da câmera. A fonte de vídeo continua substituída por imagens de teste; isso não constitui homologação de câmera física.
- A migração foi executada duas vezes em uma cópia privada da base anterior. Todas as linhas e colunas originais de cadastros, simulados, gabaritos, cartões e resultados foram preservadas; as relações de turmas e a integridade referencial foram conferidas. Um backup consistente privado foi criado antes da atualização local.
- A seleção de séries usa somente informações cadastradas/importadas; não deduz série pelo nome da turma. Os cartões individuais anteriores conservam seu comportamento original. O novo modelo pode ser gerado em um simulado existente.

As verificações abaixo registram a entrega inicial. Os limites de validação física continuam os mesmos.

## Executado

- PHP 8.2.33: análise de sintaxe dos arquivos PHP e verificação das extensões PDO SQLite, mbstring, sessão e JSON; pasta de armazenamento gravável; dependências e ícones locais presentes.
- Node 22.14.0: análise de sintaxe dos módulos JavaScript.
- **7 testes ópticos automatizados aprovados**: cartão rasterizado com QR verdadeiro, 60 questões preenchidas; questão em branco; questão com duas marcações; homografia com perspectiva e alteração de luminosidade; rotação de 90°; referência ausente; desfoque forte; preenchimento intermediário; conferência de que o QR contém apenas o token. Alguns cenários são agrupados no mesmo teste.
- **25 verificações de integração aprovadas**: servidor PHP real, SQLite isolado e chamadas HTTP com cookies/CSRF. Incluem MIME correto dos módulos, CSV real, mapeamento, prévia sem gravação, importação dos 885 estudantes/27 turmas, reimportação idempotente, registros inválidos, prova com áreas de 17/53/1 questões, disciplina única, cartões multipágina, QR desconhecido/de outro simulado, qualidade insuficiente, branco/múltiplas, resultado só após a última página, duplicidade, associação consistente do estudante, relatórios, exportação e isolamento entre escolas.
- **Fluxo de interface em DOM aprovado**, usando jsdom e o servidor PHP verdadeiro: login, turmas, criação de avaliação com áreas diferentes, gabarito, geração de cartões, leitor, associação, gravação, resultado individual, relatórios, importação, equipe, ajuda e logout. Para testar o leitor nessa integração, apenas o transporte getUserMedia é substituído por uma imagem rasterizada de um cartão cujo QR foi gerado pela API. O código de produção localiza o QR, alinha e lê as bolhas em duas capturas; o servidor recebe as medições e corrige de verdade. O teste verificou que abrir o leitor não solicita câmera, que “Próximo cartão” não a reinicia e que fechar a leitura encerra as trilhas. Isso continua sendo uma verificação automatizada de imagem, sem câmera física.
- A integração consumiu medições geradas pelo teste óptico: 11 acertos / 58 válidas, 13 anuladas em uma prova de teste de 71 questões. Estes resultados existem exclusivamente no banco temporário de testes, removido ao encerrar. Não são resultados de estudantes na aplicação.
- Hash do CSV original conferido antes e depois: arquivo inalterado. Nenhum nome, matrícula ou turma real é incluído em fixtures públicas, imagens de teste ou neste registro.
- O servidor de integração serviu somente `public/`; caminhos de CSV, banco, configuração e código privado retornaram 404. A proteção `.htaccess` foi escrita para Apache/LiteSpeed e ainda deve ser confirmada na hospedagem real.

## Não validado fisicamente

O acesso ao conector de navegador não estava disponível no ambiente. A tentativa alternativa de selecionar a janela do Chrome falhou porque a janela estava minimizada e o adaptador não conseguiu capturá-la. Portanto não foi possível concluir a inspeção visual interativa do navegador nem a emulação de celular nesta sessão. A responsividade foi implementada com CSS para telas de 700/1100 px e deve ser conferida visualmente no dispositivo de destino.

Não foi feita captura com câmera física ou impressão em papel. Os testes ópticos analisam pixels reais de cartões gerados e transformados digitalmente; não substituem o teste de campo. Não foi homologada instalação da PWA em Android/iOS nem impressão em uma impressora física. Não houve acesso nem deploy na conta Hostinger.

## Roteiro de aceitação na escola

Siga a seção “Testar a câmera com papel impresso” do README. Faça pelo menos uma prova curta, uma prova de várias folhas e os casos de QR repetido/outro simulado, imagem desfocada/cortada, branco e múltiplas. Compare a correção com o cartão em papel antes de usar com uma turma. Confira também acesso não autenticado, abertura no celular, exportação no Excel e restauração do backup.

O leitor não é uma simulação e não lê respostas de dentro do QR. Ele calcula homografia e densidade das bolhas usando a imagem capturada por getUserMedia. A homologação em condições físicas permanece uma etapa pendente.
