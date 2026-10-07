/* Épico 2 — Reservas do atleta: calendário de disponibilidade por arena (US04), criar (US05), consultar (US07),
   atualizar (dados e confirmação de presença) e cancelar (US06). */
(async () => {
  const { h, ico, api, moeda, duracao, dataLonga, dataCurta, toast, limparErros, mostrarErros, ocupado, confirmar, iniciar } = window.Arena;
  if (!(await iniciar({ perfil: 'usuario', pagina: 'reservas' }))) return;

  const $ = (s) => document.querySelector(s);
  const dlg = $('#dlg-reserva'), form = $('#f-reserva');
  const estado = {
    reservas: [], agora: '', regras: { duracoes: [60, 90, 120], maxDias: 90, antecedenciaHoras: 12 },
    hist: 'todas',
    // calendário
    arenas: [], arenaId: null, semana: null, agenda: null, filtroQuadra: 'todas',
    // formulário
    quadras: [], editando: null, disp: null, hora: null,
  };
  const hoje = () => estado.agora.slice(0, 10);

  /* ---------- Utilidades de data e horário ---------- */
  const emMin = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const diaUTC = (d) => Date.UTC(...d.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  /** 'AAAA-MM-DD HH:MM' -> minutos contados a partir do início de `data`. */
  const minNoDia = (dt, data) => (diaUTC(dt.slice(0, 10)) - diaUTC(data)) / 60000 + emMin(dt.slice(11));
  const somarDias = (d, n) => new Date(diaUTC(d) + n * 864e5).toISOString().slice(0, 10);
  const segundaDe = (d) => somarDias(d, -((new Date(diaUTC(d)).getUTCDay() + 6) % 7));
  const fechaMin = (q) => (q.horaFechamento === '00:00' ? 1440 : emMin(q.horaFechamento));
  const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const partes = (d) => { const x = new Date(diaUTC(d)); return { dia: x.getUTCDate(), mes: MES[x.getUTCMonth()], ano: x.getUTCFullYear(), sem: SEM[x.getUTCDay()] }; };

  /* =====================================================================
     Calendário de disponibilidade
     ===================================================================== */
  async function carregarArenas() {
    const { ok, j } = await api('GET', '/api/arenas');
    if (!ok) { toast(j.mensagem || 'Não foi possível carregar as arenas.', 'erro'); return; }
    estado.arenas = j.arenas; // já vem em ordem alfabética
    const sel = $('#arena');
    sel.replaceChildren(...estado.arenas.map((a) => h('option', { value: a.id }, `${a.nome} · ${a.quadras} quadra${a.quadras > 1 ? 's' : ''}`)));
    sel.disabled = !estado.arenas.length;
    estado.arenaId = estado.arenas[0]?.id ?? null;
    if (estado.arenaId) sel.value = estado.arenaId;
  }

  async function carregarAgenda() {
    const cal = $('#cal');
    if (!estado.arenaId) {
      $('#f-quadra').replaceChildren(h('option', { value: 'todas' }, 'Todas as quadras'));
      $('#f-quadra').disabled = true;
      $('#semana-rotulo').textContent = 'Disponibilidade';
      cal.removeAttribute('aria-busy');
      cal.replaceChildren(h('div', { class: 'vazio cal-vazio' }, ico('court'), h('b', {}, 'Nenhuma arena disponível'),
        h('span', {}, 'Assim que uma arena cadastrar quadras, os horários aparecem aqui.')));
      return;
    }
    cal.setAttribute('aria-busy', 'true');
    const { ok, j } = await api('GET', `/api/arenas/${estado.arenaId}/agenda?inicio=${estado.semana}&dias=7`);
    cal.removeAttribute('aria-busy');
    if (!ok) return toast(j.mensagem || 'Não foi possível carregar a agenda.', 'erro');
    estado.agenda = j;
    estado.agora = j.agora;
    if (estado.filtroQuadra !== 'todas' && !j.quadras.some((q) => q.id === estado.filtroQuadra)) estado.filtroQuadra = 'todas';
    desenharFiltroQuadras();
    desenharCalendario();
  }

  /** Lista de quadras da arena (padrão: Todas as quadras), em ordem alfabética. */
  function desenharFiltroQuadras() {
    const quadras = [...estado.agenda.quadras].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    const sel = $('#f-quadra');
    sel.replaceChildren(h('option', { value: 'todas' }, 'Todas as quadras'), ...quadras.map((q) => h('option', { value: q.id }, q.nome)));
    sel.disabled = !quadras.length;
    sel.value = String(estado.filtroQuadra);
  }

  function rotuloSemana() {
    const a = partes(estado.semana), b = partes(somarDias(estado.semana, 6));
    return a.mes === b.mes ? `${a.dia} – ${b.dia} ${b.mes} ${b.ano}` : `${a.dia} ${a.mes} – ${b.dia} ${b.mes} ${b.ano}`;
  }

  function desenharCalendario() {
    const ag = estado.agenda, cal = $('#cal');
    $('#semana-rotulo').textContent = rotuloSemana();
    $('#sem-ant').disabled = estado.semana <= segundaDe(hoje());
    const limite = somarDias(hoje(), estado.regras.maxDias);
    $('#sem-prox').disabled = somarDias(estado.semana, 7) > limite;

    const quadras = estado.filtroQuadra === 'todas' ? ag.quadras : ag.quadras.filter((q) => q.id === estado.filtroQuadra);
    if (!quadras.length) {
      cal.replaceChildren(h('div', { class: 'vazio cal-vazio' }, ico('court'), h('b', {}, 'Esta arena ainda não tem quadras disponíveis')));
      return;
    }
    const iniH = Math.floor(Math.min(...quadras.map((q) => emMin(q.horaAbertura))) / 60);
    const fimH = Math.ceil(Math.max(...quadras.map(fechaMin)) / 60);
    const [diaAgora, minAgora] = [ag.agora.slice(0, 10), emMin(ag.agora.slice(11))];
    const dias = Array.from({ length: 7 }, (_, i) => somarDias(estado.semana, i));

    // Ocupações por quadra e dia, em minutos do dia.
    const ocup = (quadraId, dia) => ag.ocupados.filter((o) => o.quadraId === quadraId)
      .map((o) => ({ ini: minNoDia(o.inicio, dia), fim: minNoDia(o.fim, dia), tipo: o.tipo }));

    const celulas = [h('div', { class: 'canto' }, 'Hora')];
    dias.forEach((d) => {
      const p = partes(d);
      celulas.push(h('div', { class: `dia ${d === diaAgora ? 'hoje' : ''}`, role: 'columnheader' }, p.sem, h('b', {}, p.dia)));
    });

    for (let hr = iniH; hr < fimH; hr++) {
      const s = hr * 60, e = s + 60;
      celulas.push(h('div', { class: 'hora', role: 'rowheader' }, hhmm(s)));
      for (const d of dias) {
        const passado = d < diaAgora || (d === diaAgora && s <= minAgora) || d > limite;
        let minha = null;
        const livres = [];
        let abertas = 0;
        for (const q of quadras) {
          const os = ocup(q.id, d).filter((o) => o.ini < e && o.fim > s);
          const m = os.find((o) => o.tipo === 'minha');
          if (m) minha ??= q;
          if (emMin(q.horaAbertura) <= s && e <= fechaMin(q)) {
            abertas++;
            if (!os.length) livres.push(q);
          }
        }
        const p = partes(d);
        const quando = `${p.sem} ${p.dia} ${p.mes}, ${hhmm(s)}`;
        let conteudo;
        if (minha) conteudo = h('div', { class: 'minha', title: `Sua reserva · ${minha.nome}` }, 'Sua reserva', h('small', {}, minha.nome));
        else if (passado || !abertas) conteudo = h('div', { class: 'passado', 'aria-label': `${quando}: indisponível` });
        else if (livres.length) {
          const unica = quadras.length === 1;
          conteudo = h('button', {
            type: 'button', class: 'livre',
            'aria-label': `${quando}: ${unica ? 'livre' : `${livres.length} quadra(s) livre(s)`}. Reservar`,
            title: `Livre: ${livres.map((q) => q.nome).join(', ')}`,
            onclick: () => abrir(null, { arenaId: estado.arenaId, quadraId: livres[0].id, data: d, hora: hhmm(s) }),
          }, unica ? h('b', {}, 'Livre') : [h('b', {}, livres.length), h('span', {}, livres.length > 1 ? 'livres' : 'livre')]);
        } else conteudo = h('div', { class: 'ocupado', 'aria-label': `${quando}: ocupado` }, ico('lock', 'ico p'));
        celulas.push(h('div', { class: `cel ${d === diaAgora && s <= minAgora && minAgora < e ? 'agora-linha' : ''}` }, conteudo));
      }
    }
    cal.replaceChildren(h('div', { class: 'cal', role: 'grid', 'aria-label': `Disponibilidade de ${ag.arena.nome}, ${rotuloSemana()}` }, celulas));

    // Leva a rolagem até o primeiro horário que ainda dá para reservar (e, no celular, até a coluna de hoje).
    cal.scrollTop = 0; cal.scrollLeft = 0;
    const base = cal.getBoundingClientRect(), cab = cal.querySelector('.canto').getBoundingClientRect();
    const alvo = cal.querySelector('.cel .livre, .cel .minha')?.parentElement;
    if (alvo) cal.scrollTop = Math.max(0, alvo.getBoundingClientRect().top - base.top - cab.height - 8);
    const hojeCol = cal.querySelector('.dia.hoje');
    if (hojeCol) cal.scrollLeft = Math.max(0, hojeCol.getBoundingClientRect().left - base.left - cab.width);
  }

  /* ---------- Abrir / reduzir o calendário ---------- */
  function mostrarCalendario(abrir) {
    const area = $('#cal-area'), ver = $('#ver-cal');
    area.hidden = !abrir;
    ver.setAttribute('aria-expanded', String(abrir));
    ver.querySelector('span').textContent = abrir ? 'Ocultar calendário' : 'Visualizar calendário';
    if (abrir && estado.agenda) desenharCalendario(); // redesenha visível para acertar a rolagem
    if (!abrir) ver.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  $('#ver-cal').addEventListener('click', () => mostrarCalendario($('#cal-area').hidden));
  $('#ocultar-cal').addEventListener('click', () => { mostrarCalendario(false); $('#ver-cal').focus(); });

  $('#f-quadra').addEventListener('change', (e) => {
    estado.filtroQuadra = e.target.value === 'todas' ? 'todas' : Number(e.target.value);
    desenharCalendario();
  });
  $('#arena').addEventListener('change', (e) => { estado.arenaId = Number(e.target.value); estado.filtroQuadra = 'todas'; carregarAgenda(); });
  $('#sem-hoje').addEventListener('click', () => { estado.semana = segundaDe(hoje()); carregarAgenda(); });
  $('#sem-ant').addEventListener('click', () => { estado.semana = somarDias(estado.semana, -7); carregarAgenda(); });
  $('#sem-prox').addEventListener('click', () => { estado.semana = somarDias(estado.semana, 7); carregarAgenda(); });

  /* =====================================================================
     Reservas do atleta (próximas e histórico)
     ===================================================================== */
  async function carregar() {
    const { ok, j } = await api('GET', '/api/reservas?escopo=todas');
    $('#proximas').removeAttribute('aria-busy');
    if (!ok) return toast(j.mensagem || 'Não foi possível carregar suas reservas.', 'erro');
    Object.assign(estado, { reservas: j.reservas, agora: j.agora, regras: j.regras });
    $('#n-futuras').textContent = j.resumo.futuras;
    $('#n-concluidas').textContent = j.resumo.concluidas;
    $('#n-canceladas').textContent = j.resumo.canceladas;
    desenharProximas();
    desenharHistorico();
  }
  const recarregarTudo = () => Promise.all([carregar(), carregarAgenda()]);

  const ATIVAS = ['pendente', 'confirmada'];
  const STATUS = {
    pendente: ['terra', 'A confirmar'], confirmada: ['verde', 'Confirmada'], em_andamento: ['azul', 'Em andamento'],
    concluida: ['verde', 'Concluída'], cancelada: ['erro', 'Cancelada'], nao_compareceu: ['cinza', 'Não compareceu'],
  };
  const selo = (s) => h('span', { class: `selo ${STATUS[s][0]}` }, STATUS[s][1]);

  function cartao(r) {
    const acoes = [];
    if (r.podeConfirmar) acoes.push(h('button', { class: 'btn largo', type: 'button', onclick: () => confirmarPresenca(r) }, ico('check', 'ico p'), 'Confirmar presença'));
    if (r.podeAlterar) {
      acoes.push(h('button', { class: 'btn texto-perigo', type: 'button', onclick: () => cancelar(r) }, ico('x', 'ico p'), 'Cancelar'));
      acoes.push(h('button', { class: 'btn claro', type: 'button', onclick: () => abrir(r) }, ico('edit', 'ico p'), 'Alterar'));
    }
    const prazo = r.podeAlterar
      ? `Altere ou cancele até ${dataCurta(r.prazoAlteracao.slice(0, 10))} às ${r.prazoAlteracao.slice(11)}.`
      : `Prazo de ${estado.regras.antecedenciaHoras} h para alterar ou cancelar encerrado. Fale com a arena.`;

    return h('article', { class: `rcard ${r.status}` },
      h('div', { class: 'rtopo' }, h('span', { class: 'rquando' }, dataLonga(r.data, hoje())), selo(r.status)),
      h('h4', {}, r.quadra.nome),
      h('div', { class: 'rlinhas' },
        h('span', {}, ico('pin'), r.arena.nome),
        h('span', {}, ico('clock'), `${r.horaInicio} – ${r.horaFim} (${duracao(r.duracao)})`),
        h('span', {}, ico('ball'), r.modalidade.nome),
        h('span', {}, ico('money'), `${moeda(r.valorTotal)} · pagamento na arena`)),
      acoes.length > 0 && h('div', { class: 'racoes' }, acoes),
      h('p', { class: 'prazo' }, prazo));
  }

  function desenharProximas() {
    const prox = estado.reservas.filter((r) => ATIVAS.includes(r.status)).sort((a, b) => a.inicio.localeCompare(b.inicio));
    $('#proximas').replaceChildren(...(prox.length ? prox.map(cartao) : [
      h('div', { class: 'vazio', style: 'grid-column:1/-1' }, ico('cal'), h('b', {}, 'Nenhuma partida marcada'),
        h('span', {}, 'Veja a disponibilidade abaixo e escolha um horário livre.')),
    ]));
  }

  function desenharHistorico() {
    const hist = estado.reservas.filter((r) => !ATIVAS.includes(r.status) && (estado.hist === 'todas' || r.status === estado.hist));
    if (!hist.length) {
      $('#historico').replaceChildren(h('div', { class: 'vazio' }, ico('history'), h('b', {}, 'Nada por aqui ainda'),
        h('span', {}, 'Reservas jogadas e canceladas ficam registradas neste histórico.')));
      return;
    }
    $('#historico').replaceChildren(h('div', { class: 'envolve-tabela' }, h('table', { class: 'tabela' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Data / hora'), h('th', {}, 'Quadra'), h('th', { class: 'opc' }, 'Modalidade'), h('th', { class: 'num' }, 'Valor'), h('th', {}, 'Status'))),
      h('tbody', {}, hist.map((r) => h('tr', {},
        h('td', {}, dataCurta(r.data), h('small', {}, `${r.horaInicio} – ${r.horaFim}`)),
        h('td', {}, r.quadra.nome, h('small', {}, r.arena.nome), r.motivoCancelamento && h('small', {}, `Motivo: ${r.motivoCancelamento}`)),
        h('td', { class: 'opc' }, r.modalidade.nome),
        h('td', { class: 'num' }, moeda(r.valorTotal)),
        h('td', {}, selo(r.status))))))));
  }

  document.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () => {
    estado.hist = b.dataset.hist;
    document.querySelectorAll('[data-hist]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    desenharHistorico();
  }));

  /* ---------- Confirmar presença / cancelar ---------- */
  async function confirmarPresenca(r) {
    const { ok, j } = await api('PATCH', `/api/reservas/${r.id}`, { status: 'confirmada' });
    toast(j.mensagem || 'Não foi possível confirmar.', ok ? 'ok' : 'erro');
    carregar();
  }

  async function cancelar(r) {
    const c = await confirmar({
      titulo: 'Cancelar reserva?', perigo: true, botao: 'Cancelar reserva', motivo: true,
      texto: `${r.quadra.nome} (${r.arena.nome}) · ${dataLonga(r.data, hoje())}, ${r.horaInicio} – ${r.horaFim}. O horário volta a ficar livre para outros atletas.`,
    });
    if (!c.ok) return;
    const { ok, j } = await api('DELETE', `/api/reservas/${r.id}`, { motivo: c.motivo });
    toast(j.mensagem || 'Não foi possível cancelar.', ok ? 'ok' : 'erro');
    recarregarTudo();
  }

  /* =====================================================================
     Formulário: criar / alterar
     ===================================================================== */
  const quadraSel = () => estado.quadras.find((q) => q.id === Number($('#r-quadra').value));

  /** Carrega as quadras ativas da arena e preenche o select (retorna false se não houver nenhuma). */
  async function preencherQuadras(arenaId, preferida) {
    const { ok, j } = await api('GET', `/api/quadras?arena=${arenaId}`);
    estado.quadras = ok ? j.quadras : [];
    const sel = $('#r-quadra');
    sel.replaceChildren(...estado.quadras.map((q) => h('option', { value: q.id }, `${q.nome} — ${moeda(q.precoHora)}/h`)));
    sel.disabled = !estado.quadras.length;
    if (!estado.quadras.length) return false;
    sel.value = estado.quadras.some((q) => q.id === preferida) ? preferida : estado.quadras[0].id;
    return true;
  }

  /**
   * Abre o formulário. `r` = reserva a alterar; `pre` = valores sugeridos pelo calendário
   * ({ arenaId, quadraId, data, hora }). Sem nada, usa a arena que está aberta no calendário.
   */
  async function abrir(r = null, pre = {}) {
    estado.editando = r;
    estado.hora = r?.horaInicio ?? pre.hora ?? null;
    limparErros(form);
    const arenaId = r?.arena.id ?? pre.arenaId ?? estado.arenaId;
    if (!arenaId) return toast('Nenhuma arena com quadras disponíveis no momento.', 'erro');

    const arenas = [...estado.arenas];
    if (r && !arenas.some((a) => a.id === r.arena.id)) arenas.push({ id: r.arena.id, nome: r.arena.nome });
    $('#r-arena').replaceChildren(...arenas.map((a) => h('option', { value: a.id }, a.nome)));
    $('#r-arena').value = arenaId;
    if (!(await preencherQuadras(arenaId, r?.quadra.id ?? pre.quadraId)))
      return toast('Esta arena não tem quadras disponíveis para reserva no momento.', 'erro');

    $('#dr-tit').textContent = r ? 'Alterar reserva' : 'Nova reserva';
    $('#dr-sub').textContent = r ? 'Escolha a nova arena, quadra, data ou horário.' : 'Escolha a arena, a quadra, a data e um horário livre.';
    $('#r-salvar').textContent = r ? 'Salvar alterações' : 'Confirmar reserva';
    // Locação de hora em hora: só 1h, 2h, 3h ou 4h.
    const duracoes = [60, 120, 180, 240].filter((d) => estado.regras.duracoes.includes(d));
    $('#r-dur').replaceChildren(...duracoes.map((d) => h('option', { value: d }, `${d / 60}h`)));
    $('#r-dur').value = duracoes.includes(r?.duracao) ? r.duracao : 60;
    $('#r-data').min = hoje();
    $('#r-data').max = somarDias(hoje(), estado.regras.maxDias);
    $('#r-data').value = r?.data ?? pre.data ?? hoje();
    preencherModalidades(r?.modalidade.id);
    dlg.showModal();
    await atualizarHorarios();
  }

  function preencherModalidades(preferida) {
    const q = quadraSel();
    $('#r-mod').replaceChildren(...(q?.modalidades ?? []).map((m) => h('option', { value: m.id }, m.nome)));
    if (preferida && q?.modalidades.some((m) => m.id === preferida)) $('#r-mod').value = preferida;
  }

  async function atualizarHorarios() {
    const q = quadraSel(), data = $('#r-data').value, box = $('#r-horarios');
    if (!q || !data) { box.replaceChildren(h('p', { class: 'sem-horario' }, 'Escolha a quadra e a data para ver os horários.')); estado.disp = null; return resumo(); }
    const p = new URLSearchParams({ data });
    if (estado.editando) p.set('ignorarReserva', estado.editando.id);
    const { ok, j } = await api('GET', `/api/quadras/${q.id}/disponibilidade?${p}`);
    if (!ok) { box.replaceChildren(h('p', { class: 'sem-horario' }, j.mensagem || 'Não foi possível consultar os horários.')); estado.disp = null; return resumo(); }
    estado.disp = j;
    desenharHorarios();
  }

  function desenharHorarios() {
    const j = estado.disp, data = $('#r-data').value, dur = Number($('#r-dur').value), box = $('#r-horarios');
    const abre = emMin(j.horaAbertura), fecha = j.horaFechamento === '00:00' ? 1440 : emMin(j.horaFechamento);
    const agora = j.agora.slice(0, 10) === data ? emMin(j.agora.slice(11)) : j.agora.slice(0, 10) > data ? Infinity : -1;
    const ocup = j.ocupados.map((o) => ({ ini: minNoDia(o.inicio, data), fim: minNoDia(o.fim, data), tipo: o.tipo }));

    const slots = [];
    // Locação de hora em hora: inícios sempre em hora cheia.
    for (let s = Math.ceil(abre / 60) * 60; s + dur <= fecha; s += 60) {
      const choques = ocup.filter((o) => o.ini < s + dur && o.fim > s);
      const passado = s <= agora;
      const livre = !passado && !choques.length;
      const soMinha = !passado && choques.length && choques.every((c) => c.tipo === 'minha');
      const rotulo = hhmm(s);
      slots.push(h('button', {
        type: 'button', class: `slot ${soMinha ? 'minha' : ''}`, disabled: !livre,
        'aria-label': `${rotulo}${livre ? '' : passado ? ', horário passado' : soMinha ? ', você já tem reserva' : ', ocupado'}`,
        onclick: () => { estado.hora = rotulo; desenharHorarios(); },
      }, rotulo));
    }
    // Se o horário escolhido deixou de caber (troca de data/duração/quadra), limpa a seleção.
    if (estado.hora && !slots.some((b) => !b.disabled && b.textContent === estado.hora)) estado.hora = null;
    slots.forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === estado.hora)));

    const livres = slots.filter((b) => !b.disabled).length;
    box.replaceChildren(...(livres ? slots : [h('p', { class: 'sem-horario', style: 'grid-column:1/-1' },
      slots.length ? 'Nenhum horário livre nesta data para essa duração. Tente outra data ou uma duração menor.' : 'A quadra não comporta essa duração neste dia.')]));
    resumo();
  }

  function resumo() {
    const q = quadraSel(), dur = Number($('#r-dur').value), data = $('#r-data').value;
    const box = $('#r-resumo');
    if (!q || !estado.hora || !data) { box.hidden = true; return; }
    box.hidden = false;
    $('#r-quando').textContent = `${dataLonga(data, hoje())} · ${estado.hora} – ${hhmm(emMin(estado.hora) + dur)} (${duracao(dur)})`;
    $('#r-total').textContent = moeda((q.precoHora * dur) / 60);
  }

  $('#r-arena').addEventListener('change', async (e) => {
    estado.hora = null;
    if (!(await preencherQuadras(Number(e.target.value)))) toast('Esta arena não tem quadras disponíveis.', 'erro');
    preencherModalidades();
    atualizarHorarios();
  });
  $('#r-quadra').addEventListener('change', () => { preencherModalidades(Number($('#r-mod').value)); estado.hora = null; atualizarHorarios(); });
  $('#r-data').addEventListener('change', atualizarHorarios);
  $('#r-dur').addEventListener('change', () => estado.disp && desenharHorarios());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    if (!estado.hora) return mostrarErros(form, { mensagem: 'Escolha um horário livre.', erros: { horaInicio: 'Selecione o horário de início.' } });
    const corpo = {
      quadraId: Number($('#r-quadra').value), modalidadeId: Number($('#r-mod').value),
      data: $('#r-data').value, horaInicio: estado.hora, duracao: Number($('#r-dur').value),
    };
    const r = estado.editando;
    const res = await ocupado($('#r-salvar'), () => api(r ? 'PATCH' : 'POST', r ? `/api/reservas/${r.id}` : '/api/reservas', corpo));
    if (!res.ok) {
      mostrarErros(form, res.j);
      if (res.status === 409) await atualizarHorarios(); // alguém ocupou o horário: recarrega a grade
      return;
    }
    dlg.close();
    toast(res.j.mensagem);
    recarregarTudo();
  });
  dlg.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  $('#nova').addEventListener('click', () => abrir());

  /* ---------- Início ---------- */
  await carregar();                 // traz a hora atual do servidor
  estado.semana = segundaDe(hoje());
  await carregarArenas();
  await carregarAgenda();
})();
