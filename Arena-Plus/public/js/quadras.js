/* US19 — Gestão de quadras (administrador): cadastrar, listar, editar, desativar/reativar e remover. */
(async () => {
  const { h, ico, api, moeda, toast, limparErros, mostrarErros, ocupado, confirmar, iniciar } = window.Arena;
  if (!(await iniciar({ perfil: 'administrador', pagina: 'quadras' }))) return;

  const $ = (s) => document.querySelector(s);
  const lista = $('#lista'), dlg = $('#dlg-quadra'), form = $('#f-quadra');
  const estado = { status: 'todas', q: '', quadras: [], modalidades: [], editando: null };

  /* ---------- Carregar ---------- */
  async function carregarModalidades() {
    const { ok, j } = await api('GET', '/api/modalidades');
    if (ok) estado.modalidades = j.modalidades;
  }
  async function carregar() {
    lista.setAttribute('aria-busy', 'true');
    const p = new URLSearchParams({ status: estado.status });
    if (estado.q) p.set('q', estado.q);
    const { ok, j } = await api('GET', `/api/quadras?${p}`);
    lista.removeAttribute('aria-busy');
    if (!ok) return toast(j.mensagem || 'Não foi possível carregar as quadras.', 'erro');
    estado.quadras = j.quadras;
    desenhar();
  }

  /* ---------- Listagem ---------- */
  function cartao(q) {
    const editar = h('button', { class: 'icone', type: 'button', title: 'Editar', 'aria-label': `Editar ${q.nome}`, onclick: () => abrir(q) }, ico('edit', 'ico p'));
    const alternar = h('button', { class: 'btn claro sm', type: 'button', onclick: () => alternarStatus(q) },
      ico('power', 'ico p'), q.ativa ? 'Desativar' : 'Reativar');
    const remover = h('button', { class: 'icone perigo', type: 'button', title: 'Remover', 'aria-label': `Remover ${q.nome}`, onclick: () => remover_(q) }, ico('trash', 'ico p'));
    const fecha = q.horaFechamento === '00:00' ? '24:00' : q.horaFechamento;

    return h('article', { class: `qcard ${q.ativa ? '' : 'inativa'}` },
      h('div', {},
        h('p', { class: 'qmods' }, q.modalidades.map((m) => m.nome).join(' · ')),
        h('h3', { class: 'qnome' }, q.nome)),
      q.descricao && h('p', { class: 'qdesc' }, q.descricao),
      h('p', { class: 'qinfo' },
        h('span', {}, ico('money'), `${moeda(q.precoHora)}/h`),
        h('span', {}, ico('clock'), `${q.horaAbertura} – ${fecha}`),
        q.reservasFuturas > 0 && h('span', { class: 'qreservas' }, ico('cal'), `${q.reservasFuturas} reserva${q.reservasFuturas > 1 ? 's' : ''} futura${q.reservasFuturas > 1 ? 's' : ''}`)),
      h('div', { class: 'qrodape' },
        h('span', { class: `selo ${q.ativa ? 'verde' : 'cinza'}` }, q.ativa ? 'Disponível' : 'Desativada'),
        editar, alternar, remover));
  }

  function desenhar() {
    const n = estado.quadras.length;
    $('#contagem').textContent = `${n} quadra${n === 1 ? '' : 's'}`;
    if (!n) {
      const filtrando = estado.q || estado.status !== 'todas';
      lista.replaceChildren(h('div', { class: 'vazio', style: 'grid-column:1/-1' },
        ico('court'),
        h('b', {}, filtrando ? 'Nenhuma quadra encontrada' : 'Nenhuma quadra cadastrada'),
        h('span', {}, filtrando ? 'Ajuste a busca ou o filtro.' : 'Cadastre a primeira quadra para liberar as reservas dos atletas.'),
        !filtrando && h('button', { class: 'btn terra', type: 'button', onclick: () => abrir() }, ico('plus', 'ico p'), 'Nova quadra')));
      return;
    }
    lista.replaceChildren(...estado.quadras.map(cartao));
  }

  /* ---------- Formulário (cadastrar / editar) ---------- */
  function desenharModalidades(marcadas) {
    $('#q-mods').replaceChildren(...estado.modalidades.map((m) =>
      h('label', { class: 'chip' },
        h('input', { type: 'checkbox', name: 'modalidades', value: m.id, checked: marcadas.has(m.id) }),
        h('span', {}, m.nome))));
  }
  const marcadas = () => new Set([...form.querySelectorAll('[name=modalidades]:checked')].map((c) => Number(c.value)));

  function abrir(q = null) {
    estado.editando = q;
    limparErros(form);
    form.reset();
    $('#dq-tit').textContent = q ? 'Editar quadra' : 'Nova quadra';
    $('#q-salvar').textContent = q ? 'Salvar alterações' : 'Cadastrar quadra';
    $('#q-nome').value = q?.nome ?? '';
    $('#q-preco').value = q ? q.precoHora.toFixed(2).replace('.', ',') : '';
    $('#q-abre').value = q?.horaAbertura ?? '08:00';
    $('#q-fecha').value = q?.horaFechamento ?? '22:00';
    $('#q-desc').value = q?.descricao ?? '';
    $('#q-ativa').checked = q ? q.ativa : true;
    desenharModalidades(new Set(q?.modalidades.map((m) => m.id) ?? []));
    dlg.showModal();
    $('#q-nome').focus();
  }

  $('#q-add-mod').addEventListener('click', async () => {
    const input = $('#q-nova-mod');
    const nome = input.value.trim();
    if (!nome) return input.focus();
    const atuais = marcadas();
    const { ok, j } = await api('POST', '/api/modalidades', { nome });
    if (!ok) return toast(j.erros?.nome || j.mensagem, 'erro');
    if (!estado.modalidades.some((m) => m.id === j.modalidade.id))
      estado.modalidades = [...estado.modalidades, j.modalidade].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    atuais.add(j.modalidade.id);
    desenharModalidades(atuais);
    input.value = '';
  });
  $('#q-nova-mod').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#q-add-mod').click(); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const corpo = {
      nome: $('#q-nome').value, precoHora: $('#q-preco').value, descricao: $('#q-desc').value,
      horaAbertura: $('#q-abre').value, horaFechamento: $('#q-fecha').value,
      modalidades: [...marcadas()], ativa: $('#q-ativa').checked,
    };
    const q = estado.editando;
    const { ok, j } = await ocupado($('#q-salvar'), () => api(q ? 'PUT' : 'POST', q ? `/api/quadras/${q.id}` : '/api/quadras', corpo));
    if (!ok) return mostrarErros(form, j);
    dlg.close();
    toast(j.mensagem);
    carregar();
  });
  dlg.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => dlg.close()));

  /* ---------- Desativar / reativar / remover ---------- */
  async function alternarStatus(q) {
    if (q.ativa) {
      const aviso = q.reservasFuturas
        ? `Ela sai da lista de reservas dos atletas. As ${q.reservasFuturas} reserva(s) futura(s) já feitas continuam valendo.`
        : 'Ela sai da lista de reservas dos atletas. Você pode reativá-la quando quiser.';
      if (!(await confirmar({ titulo: `Desativar ${q.nome}?`, texto: aviso, botao: 'Desativar' })).ok) return;
    }
    const { ok, j } = await api('PATCH', `/api/quadras/${q.id}/status`, { ativa: !q.ativa });
    toast(j.mensagem || 'Não foi possível alterar a quadra.', ok ? 'ok' : 'erro');
    if (ok) carregar();
  }

  async function remover_(q) {
    const r = await confirmar({
      titulo: `Remover ${q.nome}?`, perigo: true, botao: 'Remover quadra',
      texto: 'A quadra será apagada definitivamente. Quadras que já têm reservas não podem ser removidas, apenas desativadas.',
    });
    if (!r.ok) return;
    const { ok, j } = await api('DELETE', `/api/quadras/${q.id}`);
    if (!ok) return toast(j.mensagem || 'Não foi possível remover a quadra.', 'erro');
    toast('Quadra removida.');
    carregar();
  }

  /* ---------- Filtros ---------- */
  document.querySelectorAll('.filtro button').forEach((b) => b.addEventListener('click', () => {
    estado.status = b.dataset.status;
    document.querySelectorAll('.filtro button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    carregar();
  }));
  let espera;
  $('#busca').addEventListener('input', (e) => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.q = e.target.value.trim(); carregar(); }, 250);
  });
  $('#nova').addEventListener('click', () => abrir());

  await carregarModalidades();
  carregar();
})();
