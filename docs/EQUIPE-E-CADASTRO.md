# Cadastro, autorização e equipe

Na tela de entrada, clique em **Criar minha conta**. Informe nome, e-mail,
telefone com DDD, senha de pelo menos 12 caracteres, área de conhecimento,
disciplina e pelo menos um turno. É possível marcar **Matutino, Vespertino,
Noturno e Integral**, incluindo mais de uma opção. Confirme a senha e envie.
Se houver várias escolas instaladas, selecione a sua; com uma escola, o nome
é exibido e o vínculo é preenchido automaticamente.

O cadastro público cria um **professor pendente**, sem acesso aos dados.
O sistema mostra que é necessário aguardar a aprovação. Não há envio de e-mail
nem confirmação automática. Tentar entrar antes da aprovação mostra o aviso.

## Autorizar e editar

Entre com um administrador ou operador e abra **Equipe da escola**:

1. Em **Solicitações pendentes**, confira contato, área, disciplina e turnos.
2. Clique em **Autorizar** para liberar a entrada, ou **Recusar**.
3. Em **Todos os usuários → Editar**, altere nome, e-mail, telefone, área,
   disciplina e turnos. Para trocar a senha, preencha **Nova senha**; deixe
   vazia para manter a senha atual. Senhas não são exibidas na equipe.
4. **Suspender acesso** bloqueia a entrada e encerra as sessões existentes.
   **Autorizar acesso** permite reativar uma conta suspensa ou recusada.
5. **Adicionar usuário autorizado** permite ao gestor criar uma conta já
   aprovada, pois essa criação representa sua autorização explícita.

| Perfil | Permissões sobre a equipe |
| --- | --- |
| Administrador | Aprova, recusa, edita e suspende contas da própria escola; define Professor, Operador e Administrador. |
| Operador | Aprova, recusa, edita e suspende professores; cria professores autorizados; edita os próprios dados. |
| Professor | Usa o sistema após aprovação; não aprova cadastros nem gerencia a equipe. |

Somente um administrador pode promover um professor a operador. Um operador
não pode alterar administradores ou outros operadores. O sistema impede
retirar o próprio perfil de gestão ou suspender o próprio acesso e mantém ao
menos um administrador ativo. A edição detecta mudanças concorrentes: nesse
caso, reabra o cadastro antes de salvar novamente.

Alterações de senha, e-mail ou perfil encerram as outras sessões do usuário.
O gestor que atualiza a própria conta mantém a sessão atual. Cadastros,
aprovações e alterações ficam na auditoria. Toda a gestão fica restrita à
mesma escola; não é possível escolher outro perfil pelo formulário público.

## Atualização e limpeza solicitada

A migração **v7** é automática e preserva usuários e senhas existentes. Contas
anteriores continuam autorizadas. Os novos dados profissionais podem ser
completados pela edição; não são inventados para os usuários antigos.

A limpeza solicitada para a base local em 14/11/2026 preservou a escola e seu
usuário administrador, removeu estudantes, turmas, provas, cartões, resultados,
imagens/capas e histórico, e cadastrou **20 questões originais** no banco:
5 de Matemática, 5 de Língua Portuguesa, 5 de Ciências, 2 de História e
3 de Geografia. Elas têm cinco alternativas, classificação e resposta correta;
podem ser editadas ou usadas na montagem de provas. É necessário importar
estudantes novamente para montar uma prova com participantes.

Um backup privado consistente foi criado em `storage/backups/` antes da
limpeza. As contas e senhas foram preservadas; a limpeza exige novo login
para impedir o uso de prévias ou importações que pertenciam à base antiga.

O pacote de código exclui banco, configurações reais, backups e dados da escola.
A atualização normal **não executa limpeza**. Existe uma rotina separada de
CLI, que apaga os dados escolares e cadastra 20 questões por escola, usada
somente quando essa limpeza é intencional:

```powershell
C:\xampp\php\php.exe scripts/reset-school-data.php --execute C:\backup-privado\antes-limpeza.sqlite
```

O destino deve ser um arquivo novo em uma pasta privada já existente. A rotina
cria o backup antes da transação, preserva usuários e escolas, recusa tabelas
desconhecidas e verifica a integridade referencial. Não é uma opção da interface
nem uma etapa de instalação. O comando sem `--execute` apenas mostra o uso.

## Verificação de desenvolvimento

```powershell
python tests/accounts_integration.py
python tests/migration.py
python tests/integration.py
```

Os testes de contas usam dados descartáveis, API PHP real e Chrome/Playwright.
Cobrem cadastro e espera, múltiplos turnos, autorização, permissões, edição,
senha, suspensão, reativação, concorrência, isolamento por escola e limpeza com
backup e preservação de usuários. Capturas do formulário e da equipe usam
somente pessoas fictícias. A integração anterior usa um CSV sintético quando
o arquivo original não existe; não depende de manter estudantes na base real.
