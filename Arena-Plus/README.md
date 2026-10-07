# Arena+ Sistema

## Limpar o banco (desenvolvimento)
```bash
npm run db:limpar-reservas   # apaga só as reservas
npm run db:zerar             # apaga o banco inteiro
```

## Telas
| Rota | Perfil | Protótipo |
|---|---|---|
| `/login` | todos | 1 · Login |
| `/cadastro` | público | 2 · Cadastro de Atleta (aba **Atleta**) |
| `/cadastro#administrador` | público | 3 · Cadastro de Administrador (aba **Administrador**) |
| `/admin/reservas` | administrador | 12 · Administrador › Reservas |
| `/admin/quadras` | administrador | 14 · Configurações › Quadras |
| `/reservas` | atleta | 4 · Painel / 5 · Reserva |

Após o login cada perfil vai direto para a sua tela (administrador → `/admin/quadras`, atleta → `/reservas`).
Itens do menu marcados "em breve" (Dashboard, Funcionários, Mensagens…) são das próximas entregas.

## Arenas
Cada administrador representa uma arena (o "Nome da arena / complexo" do cadastro) e cada quadra pertence à arena de quem a cadastrou
(`quadra.arena_id`). O administrador só vê e altera as quadras da própria arena; o nome da quadra é único dentro da arena.


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
