const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const { router: authRouter } = require('./auth');
const { router: quadrasRouter } = require('./quadras');
const { router: reservasRouter } = require('./reservas');
const { router: adminRouter } = require('./admin');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/reservas', reservasRouter);
app.use('/api/admin', adminRouter);
app.use('/api', quadrasRouter); // /api/quadras e /api/modalidades
app.use('/api', (_req, res) => res.status(404).json({ mensagem: 'Rota não encontrada.' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
app.get('/', (_req, res) => res.redirect('/login'));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ mensagem: 'Requisição inválida.' });
  console.error(err);
  res.status(500).json({ mensagem: 'Erro interno do servidor.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Arena+ no ar: http://localhost:${port}`));
}
module.exports = app;
