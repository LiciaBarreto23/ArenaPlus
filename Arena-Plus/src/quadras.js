// US19 — Gestão de Quadras (CRUD do administrador) + consulta de arenas, quadras e disponibilidade para os demais perfis.
// Cada quadra pertence a uma arena (o administrador que a cadastrou; o nome vem de usuario.nome_arena).
// O administrador só enxerga e altera as quadras da própria arena.
const express = require('express');
const db = require('./db');
const { exigirAuth, exigirPerfil } = require('./auth');
const { agora, horaEmMin, HORA_RE, dataValida, somarDias } = require('./tempo');

const router = express.Router();
const soAdmin = [exigirAuth, exigirPerfil('administrador')];

/** Fechamento '00:00' significa meia-noite (fim do dia). */
const fechamentoMin = (h) => (h === '00:00' ? 1440 : horaEmMin(h));
const dinheiro = (v) => Math.round(Number(v) * 100) / 100;

const modalidadesDa = db.prepare(`
  SELECT m.id, m.nome FROM quadra_modalidade qm JOIN modalidade m ON m.id = qm.modalidade_id
  WHERE qm.quadra_id = ? ORDER BY m.nome`);
const contarFuturas = db.prepare(`
  SELECT COUNT(*) n FROM reserva WHERE quadra_id = ? AND inicio >= ? AND status IN ('pendente','confirmada')`);

const nomeArena = db.prepare("SELECT COALESCE(nome_arena, nome) AS nome FROM usuario WHERE id = ?");

function formatar(q, { admin = false } = {}) {
  const o = {
    id: q.id, arena: { id: q.arena_id, nome: nomeArena.get(q.arena_id)?.nome ?? '' }, nome: q.nome, descricao: q.descricao ?? '', precoHora: dinheiro(q.preco_hora),
    horaAbertura: q.hora_abertura, horaFechamento: q.hora_fechamento, ativa: !!q.ativa,
    modalidades: modalidadesDa.all(q.id),
  };
  if (admin) o.reservasFuturas = contarFuturas.get(q.id, agora()).n;
  return o;
}

/* ---------- Validação ---------- */
function validarQuadra(b) {
  const e = {};
  const nome = String(b.nome ?? '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 80) e.nome = 'Informe o nome da quadra (2 a 80 caracteres).';

  const descricao = String(b.descricao ?? '').trim();
  if (descricao.length > 500) e.descricao = 'A descrição pode ter no máximo 500 caracteres.';

  const preco = Number(String(b.precoHora ?? '').replace(',', '.'));
  if (!Number.isFinite(preco) || preco <= 0) e.precoHora = 'Informe um preço por hora maior que zero.';
  else if (preco > 100000) e.precoHora = 'Preço por hora muito alto.';

  const ab = String(b.horaAbertura ?? ''), fe = String(b.horaFechamento ?? '');
  if (!HORA_RE.test(ab)) e.horaAbertura = 'Informe o horário de abertura (HH:MM).';
  if (!HORA_RE.test(fe)) e.horaFechamento = 'Informe o horário de fechamento (HH:MM).';
  if (!e.horaAbertura && !e.horaFechamento) {
    // Locação de hora em hora: abertura e fechamento sempre em hora cheia.
    if (horaEmMin(ab) % 60) e.horaAbertura = 'Use hora cheia (ex.: 08:00).';
    if (fechamentoMin(fe) % 60) e.horaFechamento = 'Use hora cheia (ex.: 22:00).';
    if (!e.horaAbertura && !e.horaFechamento && fechamentoMin(fe) - horaEmMin(ab) < 60)
      e.horaFechamento = 'O fechamento deve ser pelo menos 1 hora depois da abertura.';
  }

  const ids = [...new Set((Array.isArray(b.modalidades) ? b.modalidades : []).map(Number))].filter(Number.isInteger);
  if (!ids.length) e.modalidades = 'Selecione pelo menos uma modalidade.';
  else {
    const existentes = db.prepare(`SELECT COUNT(*) n FROM modalidade WHERE ativo = 1 AND id IN (${ids.map(() => '?').join(',')})`).get(...ids).n;
    if (existentes !== ids.length) e.modalidades = 'Há modalidade inválida na seleção.';
  }

  const ativa = b.ativa === undefined ? true : b.ativa === true;
  return { e, dados: { nome, descricao: descricao || null, preco: dinheiro(preco), ab, fe, ids, ativa } };
}

// O nome só precisa ser único dentro da mesma arena.
const nomeEmUso = (arenaId, nome, ignorarId = 0) =>
  !!db.prepare('SELECT 1 FROM quadra WHERE arena_id = ? AND nome = ? COLLATE NOCASE AND id <> ?').get(arenaId, nome, ignorarId);

const salvarModalidades = (quadraId, ids) => {
  db.prepare('DELETE FROM quadra_modalidade WHERE quadra_id = ?').run(quadraId);
  const ins = db.prepare('INSERT INTO quadra_modalidade (quadra_id, modalidade_id) VALUES (?, ?)');
  ids.forEach((m) => ins.run(quadraId, m));
};

const buscar = (id) => db.prepare('SELECT * FROM quadra WHERE id = ?').get(Number(id));
/** Quadra da arena do administrador logado (de outra arena = não encontrada). */
const daMinhaArena = (req) => {
  const q = buscar(req.params.id);
  return q && q.arena_id === req.usuario.id ? q : undefined;
};
const naoEncontrada = (res) => res.status(404).json({ mensagem: 'Quadra não encontrada.' });

/* ---------- Modalidades ---------- */
router.get('/modalidades', exigirAuth, (_req, res) => {
  res.json({ modalidades: db.prepare('SELECT id, nome FROM modalidade WHERE ativo = 1 ORDER BY nome').all() });
});

router.post('/modalidades', ...soAdmin, (req, res) => {
  const nome = String(req.body?.nome ?? '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 40)
    return res.status(400).json({ mensagem: 'Revise os campos destacados.', erros: { nome: 'Informe o nome da modalidade (2 a 40 caracteres).' } });
  const existente = db.prepare('SELECT id, nome, ativo FROM modalidade WHERE nome = ?').get(nome);
  if (existente) {
    if (!existente.ativo) db.prepare('UPDATE modalidade SET ativo = 1 WHERE id = ?').run(existente.id);
    return res.json({ modalidade: { id: existente.id, nome: existente.nome } });
  }
  const { lastInsertRowid } = db.prepare('INSERT INTO modalidade (nome) VALUES (?)').run(nome);
  res.status(201).json({ modalidade: { id: lastInsertRowid, nome } });
});

/* ---------- Arenas (para o atleta escolher onde jogar) ---------- */
const OCUPAM = "('pendente','confirmada','em_andamento')";

/** Arenas com pelo menos uma quadra ativa, em ordem alfabética. */
router.get('/arenas', exigirAuth, (_req, res) => {
  const arenas = db.prepare(`
    SELECT u.id, COALESCE(NULLIF(TRIM(u.nome_arena), ''), u.nome) AS nome, COUNT(q.id) AS quadras
    FROM usuario u JOIN quadra q ON q.arena_id = u.id AND q.ativa = 1
    WHERE u.perfil = 'administrador' AND u.ativo = 1
    GROUP BY u.id`).all();
  arenas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  res.json({ arenas });
});

/**
 * Agenda de uma arena (US04): quadras ativas + horários ocupados num intervalo de dias.
 * Alimenta o calendário semanal do atleta. Não expõe quem reservou.
 */
router.get('/arenas/:id/agenda', exigirAuth, (req, res) => {
  const arena = db.prepare(`SELECT id, COALESCE(NULLIF(TRIM(nome_arena), ''), nome) AS nome FROM usuario
                            WHERE id = ? AND perfil = 'administrador' AND ativo = 1`).get(Number(req.params.id));
  if (!arena) return res.status(404).json({ mensagem: 'Arena não encontrada.' });
  const inicio = String(req.query.inicio || agora().slice(0, 10));
  if (!dataValida(inicio)) return res.status(400).json({ mensagem: 'Informe uma data inicial válida (AAAA-MM-DD).' });
  const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 14);
  const ini = `${inicio} 00:00`, fim = `${somarDias(inicio, dias)} 00:00`;

  const quadras = db.prepare('SELECT * FROM quadra WHERE arena_id = ? AND ativa = 1 ORDER BY nome').all(arena.id);
  const ids = quadras.map((q) => q.id);
  let ocupados = [];
  if (ids.length) {
    const marc = ids.map(() => '?').join(',');
    ocupados = [
      ...db.prepare(`SELECT quadra_id, inicio, fim, cliente_id FROM reserva
                     WHERE quadra_id IN (${marc}) AND status IN ${OCUPAM} AND inicio < ? AND fim > ?`).all(...ids, fim, ini)
        .map((r) => ({ quadraId: r.quadra_id, inicio: r.inicio, fim: r.fim, tipo: r.cliente_id === req.usuario.id ? 'minha' : 'reservado' })),
      ...db.prepare(`SELECT quadra_id, inicio, fim FROM bloqueio_horario WHERE quadra_id IN (${marc}) AND inicio < ? AND fim > ?`).all(...ids, fim, ini)
        .map((b) => ({ quadraId: b.quadra_id, inicio: b.inicio, fim: b.fim, tipo: 'bloqueado' })),
    ];
  }
  res.json({
    arena, agora: agora(), inicio, dias,
    quadras: quadras.map((q) => {
      const { reservasFuturas, ...o } = formatar(q);
      return o;
    }),
    ocupados,
  });
});

/* ---------- Quadras: consultar / listar ---------- */
router.get('/quadras', exigirAuth, (req, res) => {
  const admin = req.usuario.perfil === 'administrador';
  const where = [], args = [];
  // Administrador: só as quadras da própria arena. Demais perfis: quadras ativas, opcionalmente de uma arena.
  if (admin) { where.push('arena_id = ?'); args.push(req.usuario.id); }
  else if (Number(req.query.arena)) { where.push('arena_id = ?'); args.push(Number(req.query.arena)); }
  const status = admin ? String(req.query.status || 'todas') : 'ativas';
  if (status === 'ativas') where.push('ativa = 1');
  else if (status === 'inativas') where.push('ativa = 0');
  const q = String(req.query.q || '').trim();
  if (q) {
    where.push(`(nome LIKE ? OR EXISTS (SELECT 1 FROM quadra_modalidade qm JOIN modalidade m ON m.id = qm.modalidade_id
                 WHERE qm.quadra_id = quadra.id AND m.nome LIKE ?))`);
    args.push(`%${q}%`, `%${q}%`);
  }
  const mod = Number(req.query.modalidade);
  if (mod) { where.push('EXISTS (SELECT 1 FROM quadra_modalidade WHERE quadra_id = quadra.id AND modalidade_id = ?)'); args.push(mod); }

  const linhas = db.prepare(`SELECT * FROM quadra ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ativa DESC, nome`).all(...args);
  res.json({ quadras: linhas.map((l) => formatar(l, { admin })) });
});

router.get('/quadras/:id', exigirAuth, (req, res) => {
  const admin = req.usuario.perfil === 'administrador';
  const q = admin ? daMinhaArena(req) : buscar(req.params.id);
  if (!q || (!q.ativa && !admin)) return naoEncontrada(res);
  res.json({ quadra: formatar(q, { admin }) });
});

/** Horários ocupados de uma quadra num dia (US04). Não expõe quem reservou. */
router.get('/quadras/:id/disponibilidade', exigirAuth, (req, res) => {
  const q = buscar(req.params.id);
  if (!q || !q.ativa) return naoEncontrada(res);
  const data = String(req.query.data || '');
  if (!dataValida(data)) return res.status(400).json({ mensagem: 'Informe uma data válida (AAAA-MM-DD).' });
  const ignorar = Number(req.query.ignorarReserva) || 0;
  const ini = `${data} 00:00`, fim = `${somarDias(data, 1)} 00:00`;

  const reservas = db.prepare(`
    SELECT inicio, fim, cliente_id FROM reserva
    WHERE quadra_id = ? AND status IN ${OCUPAM} AND id <> ? AND inicio < ? AND fim > ?`)
    .all(q.id, ignorar, fim, ini);
  const bloqueios = db.prepare('SELECT inicio, fim FROM bloqueio_horario WHERE quadra_id = ? AND inicio < ? AND fim > ?').all(q.id, fim, ini);

  res.json({
    data, agora: agora(), horaAbertura: q.hora_abertura, horaFechamento: q.hora_fechamento, precoHora: dinheiro(q.preco_hora),
    ocupados: [
      ...reservas.map((r) => ({ inicio: r.inicio, fim: r.fim, tipo: r.cliente_id === req.usuario.id ? 'minha' : 'reservado' })),
      ...bloqueios.map((b) => ({ inicio: b.inicio, fim: b.fim, tipo: 'bloqueado' })),
    ],
  });
});

/* ---------- Quadras: cadastrar / editar / desativar / remover (administrador) ---------- */
router.post('/quadras', ...soAdmin, (req, res) => {
  const { e, dados: d } = validarQuadra(req.body ?? {});
  if (!e.nome && nomeEmUso(req.usuario.id, d.nome)) e.nome = 'Já existe uma quadra com este nome na sua arena.';
  if (Object.keys(e).length) return res.status(400).json({ mensagem: 'Revise os campos destacados.', erros: e });

  const id = db.transaction(() => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO quadra (arena_id, nome, descricao, preco_hora, hora_abertura, hora_fechamento, ativa) VALUES (?,?,?,?,?,?,?)`)
      .run(req.usuario.id, d.nome, d.descricao, d.preco, d.ab, d.fe, d.ativa ? 1 : 0);
    salvarModalidades(lastInsertRowid, d.ids);
    return lastInsertRowid;
  })();
  res.status(201).json({ quadra: formatar(buscar(id), { admin: true }), mensagem: 'Quadra cadastrada.' });
});

router.put('/quadras/:id', ...soAdmin, (req, res) => {
  const q = daMinhaArena(req);
  if (!q) return naoEncontrada(res);
  const { e, dados: d } = validarQuadra({ ...req.body, ativa: req.body?.ativa ?? !!q.ativa });
  if (!e.nome && nomeEmUso(req.usuario.id, d.nome, q.id)) e.nome = 'Já existe uma quadra com este nome na sua arena.';
  if (Object.keys(e).length) return res.status(400).json({ mensagem: 'Revise os campos destacados.', erros: e });

  db.transaction(() => {
    db.prepare(`UPDATE quadra SET nome = ?, descricao = ?, preco_hora = ?, hora_abertura = ?, hora_fechamento = ?, ativa = ? WHERE id = ?`)
      .run(d.nome, d.descricao, d.preco, d.ab, d.fe, d.ativa ? 1 : 0, q.id);
    salvarModalidades(q.id, d.ids);
  })();
  // Reservas já feitas mantêm o valor e o horário combinados; as novas regras valem para as próximas.
  res.json({ quadra: formatar(buscar(q.id), { admin: true }), mensagem: 'Alterações salvas.' });
});

router.patch('/quadras/:id/status', ...soAdmin, (req, res) => {
  const q = daMinhaArena(req);
  if (!q) return naoEncontrada(res);
  if (typeof req.body?.ativa !== 'boolean') return res.status(400).json({ mensagem: 'Informe se a quadra fica ativa (true/false).' });
  db.prepare('UPDATE quadra SET ativa = ? WHERE id = ?').run(req.body.ativa ? 1 : 0, q.id);
  res.json({ quadra: formatar(buscar(q.id), { admin: true }), mensagem: req.body.ativa ? 'Quadra reativada.' : 'Quadra desativada.' });
});

router.delete('/quadras/:id', ...soAdmin, (req, res) => {
  const q = daMinhaArena(req);
  if (!q) return naoEncontrada(res);
  // Quadra com histórico de reservas não pode ser apagada (perderia o histórico e os indicadores do dashboard).
  const { n } = db.prepare('SELECT COUNT(*) n FROM reserva WHERE quadra_id = ?').get(q.id);
  if (n) return res.status(409).json({
    mensagem: `Esta quadra possui ${n} reserva(s) registrada(s) e não pode ser removida. Desative-a para impedir novas reservas.`,
  });
  db.prepare('DELETE FROM quadra WHERE id = ?').run(q.id);
  res.status(204).end();
});

module.exports = { router, fechamentoMin };
