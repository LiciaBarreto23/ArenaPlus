// US18 — Reservas da arena (visão do administrador): agenda com quem reservou, só da própria arena.
const express = require('express');
const db = require('./db');
const { exigirAuth, exigirPerfil } = require('./auth');
const { agora, dataValida, somarDias } = require('./tempo');

const router = express.Router();
router.use(exigirAuth, exigirPerfil('administrador'));

const dinheiro = (v) => Math.round(Number(v) * 100) / 100;
const modalidadesDa = db.prepare(`
  SELECT m.id, m.nome FROM quadra_modalidade qm JOIN modalidade m ON m.id = qm.modalidade_id
  WHERE qm.quadra_id = ? ORDER BY m.nome`);

/**
 * GET /api/admin/agenda?inicio=AAAA-MM-DD&dias=1..42
 * Quadras da arena (ativas, ou desativadas que tenham reserva no período), reservas que ocupam horário
 * (com dados do cliente) e bloqueios.
 */
router.get('/agenda', (req, res) => {
  const inicio = String(req.query.inicio || agora().slice(0, 10));
  if (!dataValida(inicio)) return res.status(400).json({ mensagem: 'Informe uma data inicial válida (AAAA-MM-DD).' });
  const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 42);
  const ini = `${inicio} 00:00`, fim = `${somarDias(inicio, dias)} 00:00`;
  const arenaId = req.usuario.id;

  // Reservas cujo horário já passou deixam de ficar "em aberto" (mesma regra da tela do atleta).
  db.prepare("UPDATE reserva SET status = 'concluida' WHERE status IN ('pendente','confirmada') AND fim <= ?").run(agora());

  const reservas = db.prepare(`
    SELECT r.id, r.quadra_id, r.modalidade_id, r.inicio, r.fim, r.valor_total, r.status, r.origem, r.criado_em,
           m.nome AS modalidade, c.nome AS cliente, c.telefone, c.email
    FROM reserva r
    JOIN quadra q ON q.id = r.quadra_id AND q.arena_id = ?
    JOIN modalidade m ON m.id = r.modalidade_id
    JOIN usuario c ON c.id = r.cliente_id
    WHERE r.status NOT IN ('cancelada','nao_compareceu') AND r.inicio < ? AND r.fim > ?
    ORDER BY r.inicio`).all(arenaId, fim, ini);

  const comReserva = new Set(reservas.map((r) => r.quadra_id));
  const quadras = db.prepare('SELECT * FROM quadra WHERE arena_id = ? ORDER BY nome').all(arenaId)
    .filter((q) => q.ativa || comReserva.has(q.id))
    .map((q) => ({
      id: q.id, nome: q.nome, ativa: !!q.ativa, precoHora: dinheiro(q.preco_hora),
      horaAbertura: q.hora_abertura, horaFechamento: q.hora_fechamento, modalidades: modalidadesDa.all(q.id),
    }));

  const ids = quadras.map((q) => q.id);
  const bloqueios = ids.length
    ? db.prepare(`SELECT quadra_id, inicio, fim, motivo, descricao FROM bloqueio_horario
                  WHERE quadra_id IN (${ids.map(() => '?').join(',')}) AND inicio < ? AND fim > ?`).all(...ids, fim, ini)
    : [];

  const { n: canceladas } = db.prepare(`
    SELECT COUNT(*) n FROM reserva r JOIN quadra q ON q.id = r.quadra_id AND q.arena_id = ?
    WHERE r.status = 'cancelada' AND r.inicio < ? AND r.fim > ?`).get(arenaId, fim, ini);

  const modalidades = [...new Map(quadras.flatMap((q) => q.modalidades).map((m) => [m.id, m])).values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  res.json({
    agora: agora(), inicio, dias, quadras, modalidades, canceladas,
    reservas: reservas.map((r) => ({
      id: r.id, quadraId: r.quadra_id, modalidadeId: r.modalidade_id, modalidade: r.modalidade,
      inicio: r.inicio, fim: r.fim, valorTotal: dinheiro(r.valor_total), status: r.status, origem: r.origem, criadoEm: r.criado_em,
      cliente: { nome: r.cliente, telefone: r.telefone, email: r.email },
    })),
    bloqueios: bloqueios.map((b) => ({ quadraId: b.quadra_id, inicio: b.inicio, fim: b.fim, motivo: b.motivo, descricao: b.descricao })),
  });
});

module.exports = { router };
