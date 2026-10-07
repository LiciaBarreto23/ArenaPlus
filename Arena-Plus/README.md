# Arena+ — Sprint II

Autenticação (Épico 1: US01, US02), **Gestão de quadras** (US19) e **Reservas do atleta** (Épico 2: US04–US07).

## Rodar
```bash
npm install
cp .env.example .env     # defina JWT_SECRET
npm start                # http://localhost:3000   (requer Node >= 22.9)
```

## Limpar o banco (desenvolvimento)
```bash
npm run db:limpar-reservas   # apaga só as reservas; usuários, arenas e quadras continuam (pode rodar com o servidor ligado)
npm run db:zerar             # apaga o banco inteiro; pare o servidor antes. Ele é recriado vazio no próximo npm start
```

## Telas
| Rota | Perfil | Protótipo |
|---|---|---|
| `/login` | todos | 1 · Login (foto da arena à esquerda, logo verde) |
| `/cadastro` | público | 2 · Cadastro de Atleta (aba **Atleta**, logo branca) |
| `/cadastro#administrador` | público | 3 · Cadastro de Administrador (aba **Administrador**) |
| `/admin/reservas` | administrador | 12 · Administrador › Reservas (agenda por dia, semana ou mês) |
| `/admin/quadras` | administrador | 14 · Configurações › Quadras |
| `/reservas` | atleta | 4 · Painel / 5 · Reserva ("Reservas", com calendário semanal por arena) |

Após o login cada perfil vai direto para a sua tela (administrador → `/admin/quadras`, atleta → `/reservas`).
Menu do administrador: Dashboard, Reservas, Mensagens ── Quadras, Funcionários (os dois últimos são configurações).
Itens do menu marcados "em breve" (Dashboard, Funcionários, Mensagens…) são das próximas entregas.

## Arenas
Cada administrador representa uma arena (o "Nome da arena / complexo" do cadastro) e cada quadra pertence à arena de quem a cadastrou
(`quadra.arena_id`). O administrador só vê e altera as quadras da própria arena; o nome da quadra é único dentro da arena.

| Método e rota | Uso |
|---|---|
| `GET /api/arenas` | arenas com pelo menos uma quadra ativa, **em ordem alfabética** (seletor do atleta) |
| `GET /api/arenas/:id/agenda?inicio=AAAA-MM-DD&dias=7` | quadras ativas da arena + horários ocupados no período (alimenta o calendário) |

**Tela do atleta (de cima para baixo):** próximas partidas + cards "Bora jogar?" e regras de alteração → Disponibilidade (arena, quadra e
o botão "Visualizar calendário", que expande o calendário; "Reduzir calendário" fecha) → histórico de partidas.

**Calendário do atleta:** lista de arenas (inicia na primeira em ordem alfabética) e lista de quadras (padrão "Todas as quadras"),
semana de segunda a domingo com navegação (Hoje / ‹ ›, limitada a 90 dias). Cada célula de 1 h mostra quantas
quadras estão livres, ocupado (cadeado), "Sua reserva" ou fechado/passado. Clicar numa célula livre abre a Nova reserva já com
arena, quadra, data e horário preenchidos; o botão "Nova reserva" abre com a arena que está no calendário.

## Reservas da arena (administrador)
`GET /api/admin/agenda?inicio=AAAA-MM-DD&dias=1..42` — quadras da arena do administrador logado, reservas que ocupam horário
(com nome, telefone e e-mail do cliente) e bloqueios. Outro administrador ou atleta não acessa.

Tela `/admin/reservas`: filtros de quadra (padrão "Todas as quadras") e modalidade; visão por **dia** (colunas = quadras),
**semana** (colunas = dias; com várias quadras mostra "N reservas / N livres" por horário) ou **mês** (grade de dias com as
reservas resumidas). Clicar num horário da semana ou num dia do mês abre aquele dia; clicar numa reserva mostra os dados do
cliente. O topo mostra reservas, ocupação e valor previsto do período visível.

## CRUD 1 — Quadras (administrador)
| Ação | Método e rota | Regras |
|---|---|---|
| Cadastrar | `POST /api/quadras` | nome único na arena, preço/h > 0, abertura e fechamento em **hora cheia** (fechamento `00:00` = meia-noite, mínimo 1 h de funcionamento), ao menos uma modalidade |
| Consultar / listar | `GET /api/quadras?status=todas\|ativas\|inativas&q=` · `GET /api/quadras/:id` | administrador: só as da própria arena · atleta: só ativas, filtráveis por `?arena=` |
| Editar | `PUT /api/quadras/:id` | mesmas regras do cadastro; reservas já feitas mantêm horário e valor |
| Desativar / reativar | `PATCH /api/quadras/:id/status` `{ ativa }` | quadra desativada some da tela de reserva; reservas existentes continuam valendo |
| Remover | `DELETE /api/quadras/:id` | só se a quadra **nunca** teve reserva (preserva histórico e indicadores); senão `409` sugerindo desativar |

Modalidades: `GET /api/modalidades` (lista) e `POST /api/modalidades` (administrador cria uma nova direto no formulário da quadra).

## CRUD 2 — Reservas (atleta)
| Ação | Método e rota | Regras |
|---|---|---|
| Criar | `POST /api/reservas` `{ quadraId, modalidadeId, data, horaInicio, duracao }` | quadra ativa; modalidade oferecida na quadra; dentro do horário de funcionamento; horário futuro; até 90 dias à frente; **locação de hora em hora**: início em hora cheia e duração de 1, 2, 3 ou 4 h; sem conflito com outra reserva/bloqueio da quadra nem com outra reserva do próprio atleta. Status inicial `pendente`, origem `online`, valor = preço/h × duração |
| Consultar | `GET /api/reservas?escopo=todas\|proximas\|historico\|canceladas` · `GET /api/reservas/:id` | só as reservas do próprio atleta; reservas cujo horário já passou viram `concluida` |
| Atualizar dados | `PATCH /api/reservas/:id` `{ quadraId?, modalidadeId?, data?, horaInicio?, duracao? }` | só `pendente`/`confirmada`, com **12 h** de antecedência; revalida tudo e recalcula o valor |
| Atualizar status | `PATCH /api/reservas/:id` `{ status: "confirmada" }` | o atleta confirma presença; demais status (check-in, conclusão, não compareceu) ficam para funcionário/administrador |
| Cancelar | `DELETE /api/reservas/:id` `{ motivo? }` | só `pendente`/`confirmada`, com **12 h** de antecedência (US06); grava `cancelada_em` e `motivo_cancelamento` |

Disponibilidade (US04): `GET /api/quadras/:id/disponibilidade?data=AAAA-MM-DD` devolve horário de funcionamento e intervalos ocupados
(reservas e `bloqueio_horario`), sem expor quem reservou. A tela monta a grade de horários livres a partir disso.

**Concorrência (risco R3):** a checagem de conflito e a gravação acontecem na mesma transação `BEGIN IMMEDIATE`; se outra pessoa
pegar o horário no meio do caminho, a API responde `409` e a tela recarrega a grade.

## Banco
Tabelas da modelagem (seção 7 do documento): `usuario`, `modalidade`, `quadra`, `quadra_modalidade`, `reserva`, `bloqueio_horario`.
Datas são gravadas no horário local da arena (`ARENA_TZ`, padrão `America/Sao_Paulo`) como texto `AAAA-MM-DD HH:MM`.
Modalidades iniciais: Futebol Society, Futsal, Vôlei, Vôlei de Praia, Beach Tennis, Futevôlei, Tênis, Padel, Basquete.

## Autenticação — API
| Método | Rota | Resposta |
|---|---|---|
| POST | `/api/auth/register` | `201` usuário + cookie · `400` `{erros:{campo:msg}}` · `409` e-mail já cadastrado |
| POST | `/api/auth/login` | `200` usuário + cookie · `400` campos vazios · `401` credenciais inválidas · `403` conta desativada · `429` muitas tentativas |
| POST | `/api/auth/logout` | `204` |
| GET | `/api/auth/me` | `200` usuário + tela inicial do perfil · `401` sem sessão |

## Segurança
bcrypt (custo 12) · JWT em cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` em produção) · sessão revalidada no banco a cada
requisição · controle de acesso por perfil em todas as rotas de quadras/reservas · atleta só acessa as próprias reservas ·
rate limit no login e no cadastro · Helmet (CSP sem scripts inline) · validação sempre no servidor · conteúdo digitado pelo
usuário é inserido na tela como texto, nunca como HTML.

## Locação de hora em hora
Todas as quadras, de qualquer arena, são alugadas de hora em hora: o servidor recusa início fora da hora cheia e durações quebradas,
e o cadastro de quadra só aceita abertura/fechamento em hora cheia. Quadras antigas com horário quebrado são ajustadas na
inicialização (abertura arredonda para cima, fechamento para baixo). Reservas antigas já gravadas não são alteradas.

## Decisões a confirmar
1. **`nome_arena`** (campo do protótipo do administrador) não existe na modelagem; foi adicionado à tabela `usuario`.
2. **Cadastro público de administrador** existe no protótipo, mas o PDF diz que o admin cadastra funcionários. Use `PERMITIR_CADASTRO_ADMIN=false` para fechar após criar o primeiro.
3. **Quadra pertence a uma arena**: a modelagem não tinha esse vínculo; foi adicionada a coluna `quadra.arena_id` (→ `usuario` administrador). Bancos antigos são migrados automaticamente, com as quadras existentes indo para o primeiro administrador.
4. **Fluxo de status da reserva**: `pendente` (criada) → `confirmada` (atleta confirma presença) → `concluida` (horário passou). Cancelada em qualquer momento até 12 h antes.
5. **Alteração também respeita 12 h**, igual ao cancelamento (o documento só fala de cancelamento).
6. **Pagamento** está fora do escopo (Won't): o valor é exibido como "pagamento na arena".
7. Login aceita e-mail (CPF continua aceito pelo servidor se estiver cadastrado, mas não aparece mais na tela).
8. Fora do escopo desta entrega: recuperação de senha (US03), telas de funcionário, dashboard e bloqueio de horários (a tabela já existe e já é respeitada nas reservas).
