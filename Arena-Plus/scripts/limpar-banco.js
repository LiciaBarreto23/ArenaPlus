// Limpeza do banco de desenvolvimento.
//   npm run db:limpar-reservas  -> apaga só as reservas (usuários, arenas e quadras continuam)
//   npm run db:zerar            -> apaga tudo (usuários, quadras, reservas...); o banco é recriado vazio
const fs = require('node:fs');
const path = require('node:path');

const modo = process.argv[2];
const arquivo = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'arena.db');

if (modo === 'tudo') {
  for (const f of [arquivo, `${arquivo}-wal`, `${arquivo}-shm`]) fs.rmSync(f, { force: true });
  console.log('Banco apagado. Ele será recriado vazio na próxima vez que o servidor iniciar.');
  console.log('(Pare o servidor antes de zerar, se ele estiver rodando.)');
} else if (modo === 'reservas') {
  const db = require('../src/db');
  const { changes } = db.transaction(() => {
    const r = db.prepare('DELETE FROM reserva').run();
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'reserva'").run(); // numeração volta para 1
    return r;
  })();
  console.log(`${changes} reserva(s) apagada(s). Usuários, arenas e quadras foram mantidos.`);
} else {
  console.log('Use: npm run db:limpar-reservas  ou  npm run db:zerar');
  process.exitCode = 1;
}
