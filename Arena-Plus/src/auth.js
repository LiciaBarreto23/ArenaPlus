const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const db = require('./db');

const IS_PROD = process.env.NODE_ENV === 'production';
const SECRET =
  process.env.JWT_SECRET ||
  (() => {
    if (IS_PROD) throw new Error('Defina JWT_SECRET em produção.');
    console.warn('[auth] JWT_SECRET ausente: usando segredo temporário (sessões caem ao reiniciar).');
    return crypto.randomBytes(32).toString('hex');
  })();

const COOKIE = 'arena_token';
const SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_COST = 12;
const DUMMY_HASH = bcrypt.hashSync('arena-senha-inexistente', BCRYPT_COST); // iguala o tempo de resposta quando o usuário não existe
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const publico = (u) => ({
  id: u.id, nome: u.nome, email: u.email, telefone: u.telefone,
  perfil: u.perfil, nomeArena: u.nome_arena,
});

// Tela inicial de cada perfil após entrar/cadastrar.
const INICIO = { administrador: '/admin/quadras', usuario: '/reservas', funcionario: '/painel' };
const inicioDo = (u) => INICIO[u.perfil] || '/painel';

function emitirSessao(res, u) {
  const token = jwt.sign({ sub: u.id, perfil: u.perfil }, SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: SESSAO_MS, path: '/',
  });
}

/* ---------- Middlewares reutilizáveis (controle de acesso por perfil) ---------- */
function exigirAuth(req, res, next) {
  try {
    const { sub } = jwt.verify(req.cookies[COOKIE] || '', SECRET);
    const u = db.prepare('SELECT * FROM usuario WHERE id = ?').get(sub);
    if (!u || !u.ativo) throw new Error('sessão inválida');
    req.usuario = u;
    next();
  } catch {
    res.status(401).json({ mensagem: 'Sessão expirada. Entre novamente.' });
  }
}
const exigirPerfil = (...perfis) => (req, res, next) =>
  perfis.includes(req.usuario.perfil)
    ? next()
    : res.status(403).json({ mensagem: 'Você não tem permissão para acessar este recurso.' });

/* ---------- Validação ---------- */
function validarCadastro(b) {
  const e = {};
  const tipo = b.tipo;
  const admin = tipo === 'administrador';
  if (!['atleta', 'administrador'].includes(tipo)) e.tipo = 'Tipo de conta inválido.';

  const nome = String(b.nome ?? '').trim();
  if (nome.length < 3 || nome.length > 120)
    e.nome = admin ? 'Informe o nome do responsável.' : 'Informe seu nome completo.';

  const email = String(b.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) e.email = 'Informe um e-mail válido.';

  const telefone = String(b.telefone ?? '').replace(/\D/g, '');
  if (!/^\d{10,11}$/.test(telefone)) e.telefone = 'Informe o número com DDD. Ex.: (11) 98765-4321.';

  const senha = String(b.senha ?? '');
  const min = admin ? 8 : 6; // regra do protótipo: atleta 6, administrador 8
  if (senha.length < min) e.senha = `A senha deve ter no mínimo ${min} caracteres.`;
  else if (Buffer.byteLength(senha) > 72) e.senha = 'A senha é longa demais (máximo de 72 caracteres).';
  if (!admin && !e.senha && senha !== b.confirmarSenha) e.confirmarSenha = 'As senhas não coincidem.';

  let nomeArena = null;
  if (admin) {
    nomeArena = String(b.nomeArena ?? '').trim();
    if (nomeArena.length < 2 || nomeArena.length > 120) e.nomeArena = 'Informe o nome da arena ou complexo.';
  }
  if (b.aceitouTermos !== true) e.aceitouTermos = 'Aceite os Termos de Uso e a Política de Privacidade para continuar.';

  return { e, dados: { tipo, nome, email, telefone, senha, nomeArena } };
}

/* ---------- Rotas ---------- */
const router = express.Router();
const limite = (max, janelaMin, mensagem, extra = {}) =>
  rateLimit({ windowMs: janelaMin * 60 * 1000, limit: max, standardHeaders: true, legacyHeaders: false,
              message: { mensagem }, ...extra });

router.post('/register', limite(20, 60, 'Muitos cadastros em pouco tempo. Tente novamente mais tarde.'), async (req, res) => {
  const { e, dados } = validarCadastro(req.body ?? {});
  if (Object.keys(e).length) return res.status(400).json({ mensagem: 'Revise os campos destacados.', erros: e });

  if (dados.tipo === 'administrador' && process.env.PERMITIR_CADASTRO_ADMIN === 'false')
    return res.status(403).json({ mensagem: 'O cadastro de administradores está desabilitado.' });

  try {
    const hash = await bcrypt.hash(dados.senha, BCRYPT_COST);
    const perfil = dados.tipo === 'administrador' ? 'administrador' : 'usuario';
    const { lastInsertRowid } = db
      .prepare('INSERT INTO usuario (nome, email, senha_hash, telefone, perfil, nome_arena) VALUES (?,?,?,?,?,?)')
      .run(dados.nome, dados.email, hash, dados.telefone, perfil, dados.nomeArena);
    const u = db.prepare('SELECT * FROM usuario WHERE id = ?').get(lastInsertRowid);
    emitirSessao(res, u);
    res.status(201).json({ usuario: publico(u), redirecionarPara: inicioDo(u) });
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT'))
      return res.status(409).json({ mensagem: 'Revise os campos destacados.', erros: { email: 'Este e-mail já está cadastrado. Tente entrar.' } });
    console.error('[register]', err);
    res.status(500).json({ mensagem: 'Erro interno ao criar a conta. Tente novamente.' });
  }
});

router.post('/login',
  limite(10, 15, 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.', { skipSuccessfulRequests: true }),
  async (req, res) => {
    const id = String(req.body?.identificador ?? '').trim().toLowerCase();
    const senha = String(req.body?.senha ?? '');
    const erros = {};
    if (!id) erros.identificador = 'Informe seu e-mail.';
    if (!senha) erros.senha = 'Informe sua senha.';
    if (Object.keys(erros).length) return res.status(400).json({ mensagem: 'Preencha os campos obrigatórios.', erros });

    const digitos = id.replace(/\D/g, '');
    const u = id.includes('@')
      ? db.prepare('SELECT * FROM usuario WHERE email = ?').get(id)
      : digitos.length === 11 ? db.prepare('SELECT * FROM usuario WHERE cpf = ?').get(digitos) : undefined;

    const ok = await bcrypt.compare(senha, u?.senha_hash ?? DUMMY_HASH);
    if (!u || !ok) return res.status(401).json({ mensagem: 'E-mail ou senha incorretos.' });
    if (!u.ativo) return res.status(403).json({ mensagem: 'Sua conta está desativada. Procure a administração da arena.' });

    emitirSessao(res, u);
    res.json({ usuario: publico(u), redirecionarPara: inicioDo(u) });
  });

router.post('/logout', (_req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.status(204).end(); });
router.get('/me', exigirAuth, (req, res) => res.json({ usuario: publico(req.usuario), inicio: inicioDo(req.usuario) }));

module.exports = { router, exigirAuth, exigirPerfil };
