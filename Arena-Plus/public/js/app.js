/* Arena+ — utilidades compartilhadas da área logada (estrutura da página, API, avisos, formulários). */
(() => {
  /* ---------- Ícones ---------- */
  const sym = (id, d) => `<symbol id="i-${id}" viewBox="0 0 24 24">${d}</symbol>`;
  document.body.insertAdjacentHTML('afterbegin', `<svg class="sprite" aria-hidden="true">${[
    sym('user', '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
    sym('grid', '<rect x="4" y="4" width="6" height="7" rx="1"/><rect x="14" y="4" width="6" height="4" rx="1"/><rect x="14" y="12" width="6" height="8" rx="1"/><rect x="4" y="15" width="6" height="5" rx="1"/>'),
    sym('cal', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
    sym('chat', '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
    sym('court', '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.5"/>'),
    sym('users', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a5 5 0 0 1 3.5 6"/>'),
    sym('logout', '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10"/>'),
    sym('plus', '<path d="M12 5v14M5 12h14"/>'),
    sym('search', '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>'),
    sym('edit', '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    sym('trash', '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    sym('power', '<path d="M12 3v8"/><path d="M6.3 7a8 8 0 1 0 11.4 0"/>'),
    sym('clock', '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    sym('money', '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5v5M17.5 9.5v5"/>'),
    sym('ball', '<circle cx="12" cy="12" r="8.5"/><path d="M5 7.5c4 1 6 4 6.5 13M19 7.5c-4 1-6 4-6.5 13M3.5 12h17"/>'),
    sym('x', '<path d="M6 6l12 12M18 6 6 18"/>'),
    sym('info', '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
    sym('check', '<path d="m5 12 4.5 4.5L19 7"/>'),
    sym('history', '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4l3 2"/>'),
    sym('chev-l', '<path d="m15 6-6 6 6 6"/>'),
    sym('chev-r', '<path d="m9 6 6 6-6 6"/>'),
    sym('chev-d', '<path d="m6 9 6 6 6-6"/>'),
    sym('chev-u', '<path d="m6 15 6-6 6 6"/>'),
    sym('lock', '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    sym('pin', '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  ].join('')}</svg>`);

  /* ---------- Construção segura de DOM (todo texto entra como texto, nunca como HTML) ---------- */
  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) if (f != null && f !== false) el.append(f instanceof Node ? f : String(f));
    return el;
  }
  const ico = (id, cls = 'ico') => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', cls); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', `#i-${id}`);
    s.append(u); return s;
  };

  /* ---------- API ---------- */
  async function api(metodo, url, corpo) {
    try {
      const r = await fetch(url, {
        method: metodo, credentials: 'same-origin',
        headers: corpo ? { 'Content-Type': 'application/json' } : {},
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      if (r.status === 401) { location.href = '/login'; return { ok: false, status: 401, j: {} }; }
      const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, j };
    } catch {
      return { ok: false, status: 0, j: { mensagem: 'Não foi possível conectar ao servidor. Verifique sua conexão.' } };
    }
  }

  /* ---------- Formatação ---------- */
  const moeda = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const duracao = (min) => (min % 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min / 60}h`);
  const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const dataUTC = (d) => { const [a, m, dia] = d.split('-').map(Number); return new Date(Date.UTC(a, m - 1, dia)); };
  /** '2026-10-09' -> 'sexta, 9 out' (ou 'Hoje'/'Amanhã' relativo a `hoje`). */
  function dataLonga(d, hoje) {
    if (hoje) {
      const dif = Math.round((dataUTC(d) - dataUTC(hoje)) / 864e5);
      if (dif === 0) return 'Hoje';
      if (dif === 1) return 'Amanhã';
    }
    const x = dataUTC(d);
    return `${DIAS[x.getUTCDay()]}, ${x.getUTCDate()} ${MESES[x.getUTCMonth()]}`;
  }
  const dataCurta = (d) => { const x = dataUTC(d); return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${x.getUTCFullYear()}`; };

  /* ---------- Avisos ---------- */
  function toast(msg, tipo = 'ok') {
    let box = document.querySelector('.toasts');
    if (!box) { box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: `toast ${tipo}` }, ico(tipo === 'erro' ? 'info' : 'check', 'ico p'), msg);
    box.append(t);
    setTimeout(() => t.remove(), 4200);
  }

  /* ---------- Erros de formulário ---------- */
  function limparErros(form) {
    form.querySelector('.alerta')?.setAttribute('hidden', '');
    form.querySelectorAll('[data-erro]').forEach((p) => { p.textContent = ''; p.closest('.campo')?.classList.remove('invalido'); });
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  }
  function mostrarErros(form, { mensagem, erros }) {
    let primeiro = null;
    for (const [campo, msg] of Object.entries(erros ?? {})) {
      const p = form.querySelector(`[data-erro="${campo}"]`);
      if (!p) continue;
      p.textContent = msg;
      p.closest('.campo')?.classList.add('invalido');
      const input = form.querySelector(`[name="${campo}"]`);
      input?.setAttribute('aria-invalid', 'true');
      primeiro ??= input;
    }
    const alerta = form.querySelector('.alerta');
    if (alerta) { alerta.textContent = mensagem || 'Algo deu errado. Tente novamente.'; alerta.removeAttribute('hidden'); }
    (primeiro || alerta)?.focus?.();
    if (primeiro?.scrollIntoView) primeiro.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /** Executa `fn` com o botão travado e um rótulo de espera. */
  async function ocupado(btn, fn) {
    const rotulo = btn.innerHTML; btn.disabled = true; btn.textContent = 'Aguarde…';
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = rotulo; }
  }

  /** Diálogo de confirmação. Resolve com { ok, motivo }. */
  function confirmar({ titulo, texto, botao = 'Confirmar', perigo = false, motivo = false }) {
    return new Promise((resolve) => {
      const campoMotivo = motivo && h('div', { class: 'campo' },
        h('label', { for: 'conf-motivo' }, 'Motivo ', h('span', { class: 'opcional' }, '(opcional)')),
        h('textarea', { class: 'ctl', id: 'conf-motivo', maxlength: 200, rows: 3, placeholder: 'Conte para a arena o motivo do cancelamento' }));
      const ok = h('button', { class: `btn ${perigo ? 'perigo' : ''}`, value: 'ok' }, botao);
      const dlg = h('dialog', { class: 'pequeno', 'aria-labelledby': 'conf-tit' },
        h('form', { method: 'dialog' },
          h('div', { class: 'dcab' }, h('div', {}, h('h3', { id: 'conf-tit' }, titulo), h('p', {}, texto))),
          campoMotivo && h('div', { class: 'dcorpo' }, campoMotivo),
          h('div', { class: 'drodape' }, h('button', { class: 'btn claro', value: 'nao' }, 'Voltar'), ok)));
      document.body.append(dlg);
      dlg.addEventListener('close', () => {
        resolve({ ok: dlg.returnValue === 'ok', motivo: dlg.querySelector('textarea')?.value.trim() || '' });
        dlg.remove();
      });
      dlg.showModal();
      (campoMotivo ? dlg.querySelector('textarea') : ok).focus();
    });
  }

  /* ---------- Estrutura da página e sessão ---------- */
  const MENUS = {
    administrador: [
      { id: 'dashboard', rotulo: 'Dashboard', ico: 'grid', breve: true },
      { id: 'reservas', rotulo: 'Reservas', ico: 'cal', href: '/admin/reservas' },
      { id: 'mensagens', rotulo: 'Mensagens', ico: 'chat', breve: true },
      { divisor: true, rotulo: 'Configurações' },
      { id: 'quadras', rotulo: 'Quadras', ico: 'court', href: '/admin/quadras' },
      { id: 'funcionarios', rotulo: 'Funcionários', ico: 'users', breve: true },
    ],
    usuario: [
      { id: 'reservas', rotulo: 'Reservas', ico: 'cal', href: '/reservas' },
      { id: 'mensagens', rotulo: 'Mensagens', ico: 'chat', breve: true },
    ],
  };
  const PERFIS = { usuario: 'Atleta', funcionario: 'Funcionário', administrador: 'Administrador' };

  /** Confere a sessão e o perfil exigido pela página e monta menu lateral e topo. */
  async function iniciar({ perfil, pagina }) {
    const { ok, j } = await api('GET', '/api/auth/me');
    if (!ok) return null;
    const u = j.usuario;
    if (perfil && u.perfil !== perfil) { location.replace(j.inicio || '/painel'); return null; }

    const lado = document.querySelector('.lado');
    const sair = h('button', { class: 'sair', type: 'button' }, ico('logout'), h('span', {}, 'Sair'));
    sair.addEventListener('click', async () => { await api('POST', '/api/auth/logout'); location.href = '/login'; });
    lado.replaceChildren(
      h('img', { class: 'marca', src: '/img/logoBranca.svg', alt: 'Arena+' }),
      h('nav', { class: 'menu', 'aria-label': 'Menu principal' }, (MENUS[u.perfil] || []).map((m) =>
        m.divisor
          ? h('hr', { class: 'divisor', 'aria-label': m.rotulo })
          : m.breve
          ? h('a', { class: 'breve', 'aria-disabled': 'true' }, ico(m.ico), m.rotulo, h('small', {}, 'em breve'))
          : h('a', { href: m.href, 'aria-current': m.id === pagina ? 'page' : null }, ico(m.ico), m.rotulo))),
      sair);

    const iniciais = u.nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    document.querySelector('.topo').replaceChildren(
      h('h2', {}, u.nomeArena || 'Arena+'),
      h('div', { class: 'quem' }, h('div', {}, h('b', {}, u.nome), h('small', {}, PERFIS[u.perfil])), h('span', { class: 'avatar', 'aria-hidden': 'true' }, iniciais)));
    document.documentElement.classList.remove('carregando');
    return u;
  }

  window.Arena = { h, ico, api, moeda, duracao, dataLonga, dataCurta, toast, limparErros, mostrarErros, ocupado, confirmar, iniciar };
})();
