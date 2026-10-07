const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new Database(process.env.DB_FILE || path.join(dir, 'arena.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Tabelas conforme a modelagem da Sprint II (seção 7 do documento).
// Datas/horas são gravadas no horário local da arena, no formato 'AAAA-MM-DD HH:MM'.
db.exec(`
  CREATE TABLE IF NOT EXISTS usuario (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    senha_hash  TEXT    NOT NULL,
    telefone    TEXT,
    cpf         TEXT    UNIQUE,
    perfil      TEXT    NOT NULL DEFAULT 'usuario'
                CHECK (perfil IN ('usuario','funcionario','administrador')),
    nome_arena  TEXT,
    ativo       INTEGER NOT NULL DEFAULT 1,
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ---------- Quadras e horários ---------- */
  CREATE TABLE IF NOT EXISTS modalidade (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nome   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    ativo  INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS quadra (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    arena_id         INTEGER REFERENCES usuario(id),  -- administrador dono da arena (usuario.nome_arena)
    nome             TEXT    NOT NULL,
    descricao        TEXT,
    preco_hora       NUMERIC NOT NULL CHECK (preco_hora > 0),
    hora_abertura    TEXT    NOT NULL,
    hora_fechamento  TEXT    NOT NULL,
    ativa            INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS quadra_modalidade (
    quadra_id      INTEGER NOT NULL REFERENCES quadra(id) ON DELETE CASCADE,
    modalidade_id  INTEGER NOT NULL REFERENCES modalidade(id),
    PRIMARY KEY (quadra_id, modalidade_id)
  );

  CREATE TABLE IF NOT EXISTS bloqueio_horario (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    quadra_id       INTEGER NOT NULL REFERENCES quadra(id) ON DELETE CASCADE,
    funcionario_id  INTEGER REFERENCES usuario(id),
    inicio          TEXT    NOT NULL,
    fim             TEXT    NOT NULL,
    motivo          TEXT    CHECK (motivo IN ('manutencao','evento','outro')),
    descricao       TEXT
  );

  /* ---------- Reservas e operação ---------- */
  CREATE TABLE IF NOT EXISTS reserva (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id           INTEGER NOT NULL REFERENCES usuario(id),
    quadra_id            INTEGER NOT NULL REFERENCES quadra(id),
    modalidade_id        INTEGER NOT NULL REFERENCES modalidade(id),
    criado_por           INTEGER NOT NULL REFERENCES usuario(id),
    inicio               TEXT    NOT NULL,
    fim                  TEXT    NOT NULL,
    valor_total          NUMERIC NOT NULL,
    status               TEXT    NOT NULL DEFAULT 'pendente'
                         CHECK (status IN ('pendente','confirmada','em_andamento','concluida','cancelada','nao_compareceu')),
    origem               TEXT    NOT NULL DEFAULT 'online' CHECK (origem IN ('online','balcao')),
    cancelada_em         TEXT,
    motivo_cancelamento  TEXT,
    criado_em            TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK (fim > inicio)
  );
  CREATE INDEX IF NOT EXISTS ix_reserva_quadra_inicio ON reserva (quadra_id, inicio);
  CREATE INDEX IF NOT EXISTS ix_reserva_cliente ON reserva (cliente_id, inicio);
  CREATE INDEX IF NOT EXISTS ix_bloqueio_quadra_inicio ON bloqueio_horario (quadra_id, inicio);
`);

// Migração: bancos criados antes do vínculo quadra → arena ganham a coluna, e as quadras
// existentes passam para a arena do primeiro administrador.
if (!db.prepare('PRAGMA table_info(quadra)').all().some((c) => c.name === 'arena_id')) {
  db.exec('ALTER TABLE quadra ADD COLUMN arena_id INTEGER REFERENCES usuario(id)');
}
db.exec(`
  UPDATE quadra SET arena_id = (SELECT MIN(id) FROM usuario WHERE perfil = 'administrador') WHERE arena_id IS NULL;
  CREATE INDEX IF NOT EXISTS ix_quadra_arena ON quadra (arena_id);
`);

// Locação de hora em hora: quadras antigas com horário quebrado são ajustadas para horas cheias
// (abertura arredonda para cima, fechamento para baixo).
for (const q of db.prepare("SELECT id, hora_abertura a, hora_fechamento f FROM quadra WHERE substr(hora_abertura,4,2) <> '00' OR substr(hora_fechamento,4,2) <> '00'").all()) {
  const h = (t) => Number(t.slice(0, 2));
  const a = `${String(Math.min(h(q.a) + 1, 23)).padStart(2, '0')}:00`;
  const f = q.f.slice(3) === '00' ? q.f : `${String(h(q.f)).padStart(2, '0')}:00`;
  db.prepare('UPDATE quadra SET hora_abertura = ?, hora_fechamento = ? WHERE id = ?').run(q.a.slice(3) === '00' ? q.a : a, f, q.id);
}

// Modalidades iniciais (o administrador pode adicionar outras pela tela de quadras).
const semear = db.prepare('INSERT OR IGNORE INTO modalidade (nome) VALUES (?)');
for (const m of ['Futebol Society', 'Futsal', 'Vôlei', 'Vôlei de Praia', 'Beach Tennis', 'Futevôlei', 'Tênis', 'Padel', 'Basquete'])
  semear.run(m);

module.exports = db;
