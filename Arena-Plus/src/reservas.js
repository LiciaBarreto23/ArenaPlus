// Épico 2 — Reservas do Usuário (US04–US07): o atleta cria, consulta, atualiza e cancela as próprias reservas.
const express = require('express');
const db = require('./db');
const { exigirAuth, exigirPerfil } = require('./auth');
const { fechamentoMin } = require('./quadras');
const { agora, horaEmMin, minEmHora, dataValida, emMin, somarMin, somarDias } = require('./tempo');

const ANTECEDENCIA_MIN = 12 * 60;      // US06: cancelar/alterar com no mínimo 12 h de antecedência
const DURACOES = [60, 120, 180, 240];          // locação de hora em hora (1 h a 4 h)
const MAX_DIAS_ANTECEDENCIA = 90;
const ATIVAS = "('pendente','confirmada')";          // reservas que ainda podem mudar
const OCUPAM = "('pendente','confirmada','em_andamento')"; // reservas que ocupam o horário

const router = express.Router();
router.use(exigirAuth, exigirPerfil('usuario'));

const dinheiro = (v) => Math.round(Number(v) * 100) / 100;
const minutosAte = (inicio) => emMin(inicio) - emMin(agora());

/** Reservas cujo horário já passou deixam de ficar "em aberto". */
const encerrarVencidas = () =>
  db.prepare(`UPDATE reserva SET status = 'concluida' WHERE status IN ${ATIVAS} AND fim <= ?`).run(agora());

const SELECT = `
  SELECT r.*, q.nome AS quadra_nome, m.nome AS modalidade_nome,
         q.arena_id, COALESCE(NULLIF(TRIM(a.nome_arena), ''), a.nome) AS arena_nome
  FROM reserva r JOIN quadra q ON q.id = r.quadra_id JOIN modalidade m ON m.id = r.modalidade_id
  LEFT JOIN usuario a ON a.id = q.arena_id`;

function formatar(r) {
  const ativa = ['pendente', 'confirmada'].includes(r.status);
  const noPrazo = minutosAte(r.inicio) >= ANTECEDENCIA_MIN;
  return {
    id: r.id,
    arena: { id: r.arena_id, nome: r.arena_nome ?? '' },
    quadra: { id: r.quadra_id, nome: r.quadra_nome },
    modalidade: { id: r.modalidade_id, nome: r.modalidade_nome },
    data: r.inicio.slice(0, 10), horaInicio: r.inicio.slice(11), horaFim: r.fim.slice(11),
    duracao: emMin(r.fim) - emMin(r.inicio),
    inicio: r.inicio, fim: r.fim, valorTotal: dinheiro(r.valor_total),
    status: r.status, origem: r.origem,
    canceladaEm: r.cancelada_em, motivoCancelamento: r.motivo_cancelamento, criadoEm: r.criado_em,
    podeAlterar: ativa && noPrazo, podeCancelar: ativa && noPrazo, podeConfirmar: r.status === 'pendente',
    prazoAlteracao: somarMin(r.inicio, -ANTECEDENCIA_MIN),
  };
}

const minha = (req) => db.prepare(`${SELECT} WHERE r.id = ? AND r.cliente_id = ?`).get(Number(req.params.id), req.usuario.id);
const naoEncontrada = (res) => res.status(404).json({ mensagem: 'Reserva não encontrada.' });
const recusar = (res, status, mensagem, erros) => res.status(status).json({ mensagem, ...(erros && { erros }) });

/**
 * Valida os dados de horário e calcula início, fim e valor. Usado ao criar e ao alterar.
 * `ignorarId` exclui a própria reserva da checagem de conflito durante uma alteração.
 */
function validarHorario(b, usuarioId, ignorarId = 0) {
  const e = {};
  const quadra = db.prepare('SELECT * FROM quadra WHERE id = ? AND ativa = 1').get(Number(b.quadraId));
  if (!quadra) e.quadraId = 'Selecione uma quadra disponível.';

  const modalidadeId = Number(b.modalidadeId);
  if (quadra && !db.prepare('SELECT 1 FROM quadra_modalidade WHERE quadra_id = ? AND modalidade_id = ?').get(quadra.id, modalidadeId))
    e.modalidadeId = 'Selecione uma modalidade oferecida nesta quadra.';

  const data = String(b.data ?? '');
  const hoje = agora().slice(0, 10);
  if (!dataValida(data)) e.data = 'Informe a data da reserva.';
  else if (data < hoje) e.data = 'Escolha uma data a partir de hoje.';
  else if (data > somarDias(hoje, MAX_DIAS_ANTECEDENCIA)) e.data = `As reservas abrem com até ${MAX_DIAS_ANTECEDENCIA} dias de antecedência.`;

  const duracao = Number(b.duracao);
  if (!DURACOES.includes(duracao)) e.duracao = 'Escolha uma duração entre 1 h e 4 h.';

  const ini = horaEmMin(b.horaInicio);
  if (Number.isNaN(ini)) e.horaInicio = 'Escolha um horário de início.';
  else if (ini % 60) e.horaInicio = 'As reservas começam sempre em hora cheia (ex.: 18:00).';

  if (Object.keys(e).length) return { e };

  const abre = horaEmMin(quadra.hora_abertura), fecha = fechamentoMin(quadra.hora_fechamento);
  if (ini < abre || ini + duracao > fecha)
    return { e: { horaInicio: `A ${quadra.nome} funciona das ${quadra.hora_abertura} às ${quadra.hora_fechamento}. Escolha um horário dentro desse período.` } };

  const inicio = `${data} ${minEmHora(ini)}`;
  const fim = somarMin(inicio, duracao);
  if (inicio <= agora()) return { e: { horaInicio: 'Este horário já passou. Escolha outro.' } };

  const choque = db.prepare(`
    SELECT q.nome FROM reserva r JOIN quadra q ON q.id = r.quadra_id
    WHERE r.cliente_id = ? AND r.id <> ? AND r.status IN ${OCUPAM} AND r.inicio < ? AND r.fim > ?`)
    .get(usuarioId, ignorarId, fim, inicio);
  if (choque) return { e: { horaInicio: `Você já tem uma reserva neste horário (${choque.nome}).` }, status: 409 };

  const conflito = db.prepare(`
    SELECT 1 FROM reserva WHERE quadra_id = ? AND id <> ? AND status IN ${OCUPAM} AND inicio < ? AND fim > ?
    UNION ALL SELECT 1 FROM bloqueio_horario WHERE quadra_id = ? AND inicio < ? AND fim > ?`)
    .get(quadra.id, ignorarId, fim, inicio, quadra.id, fim, inicio);
  if (conflito) return { e: { horaInicio: 'Este horário acabou de ser ocupado. Escolha outro.' }, status: 409 };

  return { e: {}, dados: { quadraId: quadra.id, modalidadeId, inicio, fim, valor: dinheiro((quadra.preco_hora * duracao) / 60) } };
}

/* ---------- Consultar (US07) ---------- */
router.get('/', (req, res) => {
  encerrarVencidas();
  const escopo = String(req.query.escopo || 'todas');
  const where = ['r.cliente_id = ?'], args = [req.usuario.id];
  let ordem = 'r.inicio DESC';
  if (escopo === 'proximas') { where.push(`r.status IN ${ATIVAS}`); ordem = 'r.inicio ASC'; }
  else if (escopo === 'historico') where.push(`r.status NOT IN ${ATIVAS}`);
  else if (escopo === 'canceladas') where.push(`r.status = 'cancelada'`);

  const linhas = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${ordem}`).all(...args);
  const resumo = db.prepare(`
    SELECT SUM(status IN ${ATIVAS}) AS futuras, SUM(status = 'concluida') AS concluidas, SUM(status = 'cancelada') AS canceladas
    FROM reserva WHERE cliente_id = ?`).get(req.usuario.id);
  res.json({
    agora: agora(),
    reservas: linhas.map(formatar),
    resumo: { futuras: resumo.futuras || 0, concluidas: resumo.concluidas || 0, canceladas: resumo.canceladas || 0 },
    regras: { antecedenciaHoras: ANTECEDENCIA_MIN / 60, duracoes: DURACOES, maxDias: MAX_DIAS_ANTECEDENCIA },
  });
});

router.get('/:id', (req, res) => {
  encerrarVencidas();
  const r = minha(req);
  return r ? res.json({ reserva: formatar(r) }) : naoEncontrada(res);
});

/* ---------- Criar (US05) ---------- */
// A checagem de conflito e a gravação acontecem na mesma transação (risco R3: duas pessoas no mesmo horário).
const criar = db.transaction((b, usuario) => {
  const v = validarHorario(b, usuario.id);
  if (Object.keys(v.e).length) return v;
  const d = v.dados;
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO reserva (cliente_id, quadra_id, modalidade_id, criado_por, inicio, fim, valor_total, status, origem, criado_em)
    VALUES (?,?,?,?,?,?,?, 'pendente', 'online', ?)`)
    .run(usuario.id, d.quadraId, d.modalidadeId, usuario.id, d.inicio, d.fim, d.valor, agora());
  return { id: lastInsertRowid };
});

router.post('/', (req, res) => {
  const r = criar.immediate(req.body ?? {}, req.usuario);
  if (r.e) return recusar(res, r.status || 400, r.status === 409 ? r.e.horaInicio : 'Revise os campos destacados.', r.e);
  req.params.id = r.id;
  res.status(201).json({ reserva: formatar(minha(req)), mensagem: 'Reserva criada! Confirme sua presença até o dia do jogo.' });
});

/* ---------- Atualizar dados / status ---------- */
const alterar = db.transaction((atual, b, usuario) => {
  const novo = {
    quadraId: b.quadraId ?? atual.quadra_id, modalidadeId: b.modalidadeId ?? atual.modalidade_id,
    data: b.data ?? atual.inicio.slice(0, 10), horaInicio: b.horaInicio ?? atual.inicio.slice(11),
    duracao: b.duracao ?? emMin(atual.fim) - emMin(atual.inicio),
  };
  const v = validarHorario(novo, usuario.id, atual.id);
  if (Object.keys(v.e).length) return v;
  const d = v.dados;
  db.prepare('UPDATE reserva SET quadra_id = ?, modalidade_id = ?, inicio = ?, fim = ?, valor_total = ? WHERE id = ?')
    .run(d.quadraId, d.modalidadeId, d.inicio, d.fim, d.valor, atual.id);
  return {};
});

router.patch('/:id', (req, res) => {
  encerrarVencidas();
  const atual = minha(req);
  if (!atual) return naoEncontrada(res);
  const b = req.body ?? {};
  const mudaDados = ['quadraId', 'modalidadeId', 'data', 'horaInicio', 'duracao'].some((k) => b[k] !== undefined);

  if (b.status !== undefined) {
    // O atleta só pode confirmar presença; check-in, conclusão etc. ficam com funcionário/administrador.
    if (b.status !== 'confirmada') return recusar(res, 400, 'Status inválido. Para cancelar, use a opção Cancelar reserva.');
    if (atual.status !== 'pendente' && atual.status !== 'confirmada')
      return recusar(res, 409, 'Esta reserva não pode mais ser confirmada.');
  }
  if (mudaDados) {
    if (!['pendente', 'confirmada'].includes(atual.status)) return recusar(res, 409, 'Esta reserva não pode mais ser alterada.');
    if (minutosAte(atual.inicio) < ANTECEDENCIA_MIN)
      return recusar(res, 409, `Alterações só podem ser feitas com no mínimo ${ANTECEDENCIA_MIN / 60} horas de antecedência. Fale com a arena.`);
    const r = alterar.immediate(atual, b, req.usuario);
    if (r.e) return recusar(res, r.status || 400, r.status === 409 ? r.e.horaInicio : 'Revise os campos destacados.', r.e);
  }
  if (!mudaDados && b.status === undefined) return recusar(res, 400, 'Nada para atualizar.');
  if (b.status === 'confirmada') db.prepare("UPDATE reserva SET status = 'confirmada' WHERE id = ?").run(atual.id);

  res.json({ reserva: formatar(minha(req)), mensagem: mudaDados ? 'Reserva atualizada.' : 'Presença confirmada!' });
});

/* ---------- Cancelar (US06) ---------- */
router.delete('/:id', (req, res) => {
  encerrarVencidas();
  const atual = minha(req);
  if (!atual) return naoEncontrada(res);
  if (!['pendente', 'confirmada'].includes(atual.status)) return recusar(res, 409, 'Esta reserva não pode mais ser cancelada.');
  if (minutosAte(atual.inicio) < ANTECEDENCIA_MIN)
    return recusar(res, 409, `O cancelamento precisa ser feito com no mínimo ${ANTECEDENCIA_MIN / 60} horas de antecedência. Fale com a arena.`);
  const motivo = String(req.body?.motivo ?? '').trim().slice(0, 200) || null;
  db.prepare("UPDATE reserva SET status = 'cancelada', cancelada_em = ?, motivo_cancelamento = ? WHERE id = ?").run(agora(), motivo, atual.id);
  res.json({ reserva: formatar(minha(req)), mensagem: 'Reserva cancelada.' });
});

module.exports = { router };
