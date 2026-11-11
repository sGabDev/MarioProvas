# Registro de verificação — 10/11/2026

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
