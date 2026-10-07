(() => {
  /* Ícones (sprite injetado uma vez para as duas telas) */
  const sym = (id, d) => `<symbol id="i-${id}" viewBox="0 0 24 24">${d}</symbol>`;
  document.body.insertAdjacentHTML('afterbegin', `<svg class="sprite" aria-hidden="true">${[
    sym('user', '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
    sym('mail', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
    sym('phone', '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    sym('lock', '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    sym('eye', '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    sym('building', '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>'),
    sym('shield', '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><circle cx="12" cy="11" r="2"/>'),
    sym('arrow', '<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  ].join('')}</svg>`);

  /* Mostrar / ocultar senha */
  document.querySelectorAll('.olho').forEach((b) => b.addEventListener('click', () => {
    const input = b.parentElement.querySelector('input');
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
  }));

  /* Máscara (11) 98765-4321 */
  document.querySelectorAll('[data-mascara=telefone]').forEach((i) => i.addEventListener('input', () => {
    const d = i.value.replace(/\D/g, '').slice(0, 11);
    i.value = d.length > 6 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`
            : d.length > 2 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : d;
  }));

  /* Abas Atleta / Administrador (cadastro) */
  const abas = document.querySelectorAll('[role=tab]');
  const trocar = (tipo) => {
    document.body.dataset.tipo = tipo;
    abas.forEach((a) => a.setAttribute('aria-selected', String(a.dataset.tipo === tipo)));
    history.replaceState(null, '', tipo === 'administrador' ? '#administrador' : location.pathname);
  };
  abas.forEach((a) => a.addEventListener('click', () => trocar(a.dataset.tipo)));
  if (abas.length && location.hash === '#administrador') trocar('administrador');

  /* Erros */
  const limpar = (form) => {
    form.querySelector('.alerta').hidden = true;
    form.querySelectorAll('[data-erro]').forEach((p) => {
      p.textContent = '';
      p.closest('.campo')?.classList.remove('invalido');
      form.querySelector(`[name=${p.dataset.erro}]`)?.removeAttribute('aria-invalid');
    });
  };
  const mostrar = (form, { mensagem, erros }) => {
    let primeiro = null;
    for (const [campo, msg] of Object.entries(erros ?? {})) {
      const p = form.querySelector(`[data-erro=${campo}]`);
      const input = form.querySelector(`[name=${campo}]`);
      if (!p) continue;
      p.textContent = msg;
      p.closest('.campo')?.classList.add('invalido');
      input?.setAttribute('aria-invalid', 'true');
      primeiro ??= input;
    }
    if (primeiro) primeiro.focus();
    const alerta = form.querySelector('.alerta');
    alerta.textContent = mensagem || 'Algo deu errado. Tente novamente.';
    alerta.hidden = false;
  };

  /* Envio */
  document.querySelectorAll('form[data-api]').forEach((form) => form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpar(form);
    const dados = Object.fromEntries(new FormData(form));
    form.querySelectorAll('input[type=checkbox]').forEach((c) => (dados[c.name] = c.checked));
    if (form.dataset.tipo) dados.tipo = form.dataset.tipo;

    const btn = form.querySelector('[type=submit]');
    const rotulo = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Aguarde…';
    let redirecionando = false;
    try {
      const r = await fetch(form.dataset.api, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { redirecionando = true; location.href = j.redirecionarPara || '/painel'; return; }
      mostrar(form, j);
    } catch {
      mostrar(form, { mensagem: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.' });
    } finally {
      if (!redirecionando) { btn.disabled = false; btn.innerHTML = rotulo; }
    }
  }));
})();
