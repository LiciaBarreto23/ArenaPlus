/* US18 — Reservas da arena (administrador): agenda por dia, semana ou mês, com filtro de quadra e modalidade. */
(async () => {
  const { h, ico, api, moeda, toast, iniciar } = window.Arena;
  const usuario = await iniciar({ perfil: 'administrador', pagina: 'reservas' });
  if (!usuario) return;

  const $ = (s) => document.querySelector(s);
  const cal = $('#cal');

  /* ---------- Datas ---------- */
  const emMin = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const diaUTC = (d) => Date.UTC(...d.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  const somarDias = (d, n) => new Date(diaUTC(d) + n * 864e5).toISOString().slice(0, 10);
  const segundaDe = (d) => somarDias(d, -((new Date(diaUTC(d)).getUTCDay() + 6) % 7));
  const minNoDia = (dt, dia) => (diaUTC(dt.slice(0, 10)) - diaUTC(dia)) / 60000 + emMin(dt.slice(11));
  const fechaMin = (q) => (q.horaFechamento === '00:00' ? 1440 : emMin(q.horaFechamento));
  const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const SEM_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const p = (d) => { const x = new Date(diaUTC(d)); return { dia: x.getUTCDate(), mes: x.getUTCMonth(), ano: x.getUTCFullYear(), sem: x.getUTCDay() }; };
  const hojeLocal = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const telefone = (t) => (t && t.length >= 10 ? `(${t.slice(0, 2)}) ${t.slice(2, -4)}-${t.slice(-4)}` : t || '—');

  const STATUS = {
    pendente: ['rp', 'A confirmar'], confirmada: ['rc', 'Confirmada'], em_andamento: ['ra', 'Em andamento'], concluida: ['rd', 'Concluída'],
  };

  const estado = { visao: 'semana', ref: hojeLocal(), quadra: 'todas', mod: 'todas', dados: null };

  /* ---------- Período visível ---------- */
  function periodo() {
    if (estado.visao === 'dia') return { inicio: estado.ref, dias: 1 };
    if (estado.visao === 'semana') return { inicio: segundaDe(estado.ref), dias: 7 };
    const primeiro = `${estado.ref.slice(0, 8)}01`;
    return { inicio: segundaDe(primeiro), dias: 42, primeiro };
  }
  function rotuloPeriodo() {
    const { inicio } = periodo(), a = p(estado.ref);
    if (estado.visao === 'dia') return `${SEM_LONGO[a.sem]}, ${a.dia} de ${MES_LONGO[a.mes]} de ${a.ano}`;
    if (estado.visao === 'mes') return `${MES_LONGO[a.mes][0].toUpperCase()}${MES_LONGO[a.mes].slice(1)} de ${a.ano}`;
    const x = p(inicio), y = p(somarDias(inicio, 6));
    return x.mes === y.mes ? `${x.dia} – ${y.dia} ${MES[y.mes]} ${y.ano}` : `${x.dia} ${MES[x.mes]} – ${y.dia} ${MES[y.mes]} ${y.ano}`;
  }
  function mover(n) {
    if (estado.visao === 'dia') estado.ref = somarDias(estado.ref, n);
    else if (estado.visao === 'semana') estado.ref = somarDias(estado.ref, 7 * n);
    else { const a = p(estado.ref); const d = new Date(Date.UTC(a.ano, a.mes + n, 1)); estado.ref = d.toISOString().slice(0, 10); }
    carregar();
  }

  /* ---------- Dados ---------- */
  async function carregar() {
    const { inicio, dias } = periodo();
    cal.setAttribute('aria-busy', 'true');
    const { ok, j } = await api('GET', `/api/admin/agenda?inicio=${inicio}&dias=${dias}`);
    cal.removeAttribute('aria-busy');
    if (!ok) return toast(j.mensagem || 'Não foi possível carregar a agenda.', 'erro');
    estado.dados = j;
    preencherFiltros();
    desenhar();
  }

  function preencherFiltros() {
    const { quadras, modalidades } = estado.dados;
    const qs = [...quadras].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    $('#f-quadra').replaceChildren(h('option', { value: 'todas' }, 'Todas as quadras'),
      ...qs.map((q) => h('option', { value: q.id }, q.ativa ? q.nome : `${q.nome} (desativada)`)));
    if (estado.quadra !== 'todas' && !qs.some((q) => q.id === estado.quadra)) estado.quadra = 'todas';
    $('#f-quadra').value = String(estado.quadra);
    $('#f-mod').replaceChildren(h('option', { value: 'todas' }, 'Todas as modalidades'), ...modalidades.map((m) => h('option', { value: m.id }, m.nome)));
    if (estado.mod !== 'todas' && !modalidades.some((m) => m.id === estado.mod)) estado.mod = 'todas';
    $('#f-mod').value = String(estado.mod);
  }

  /** Quadras e reservas que passam pelos filtros de quadra e modalidade. */
  function filtrados() {
    const { quadras, reservas, bloqueios } = estado.dados;
    const qs = quadras.filter((q) => (estado.quadra === 'todas' || q.id === estado.quadra)
      && (estado.mod === 'todas' || q.modalidades.some((m) => m.id === estado.mod)));
    const ids = new Set(qs.map((q) => q.id));
    return {
      quadras: qs,
      reservas: reservas.filter((r) => ids.has(r.quadraId) && (estado.mod === 'todas' || r.modalidadeId === estado.mod)),
      bloqueios: bloqueios.filter((b) => ids.has(b.quadraId)),
    };
  }

  /* ---------- Resumo do período ---------- */
  function resumo(f, diasVisiveis) {
    const set = new Set(diasVisiveis);
    const rs = f.reservas.filter((r) => set.has(r.inicio.slice(0, 10)));
    let aberto = 0, ocupado = 0;
    for (const q of f.quadras) {
      const abre = emMin(q.horaAbertura), fecha = fechaMin(q);
      for (const d of diasVisiveis) {
        aberto += fecha - abre;
        for (const r of rs.filter((x) => x.quadraId === q.id && x.inicio.startsWith(d)))
          ocupado += Math.max(0, Math.min(minNoDia(r.fim, d), fecha) - Math.max(minNoDia(r.inicio, d), abre));
      }
    }
    $('#n-reservas').textContent = rs.length;
    $('#n-ocupacao').textContent = `${aberto ? Math.round((ocupado / aberto) * 100) : 0}%`;
    $('#n-valor').textContent = moeda(rs.reduce((s, r) => s + r.valorTotal, 0)).replace(/,00$/, '');
  }

  /* ---------- Desenho ---------- */
  function desenhar() {
    $('#periodo').textContent = rotuloPeriodo();
    document.querySelectorAll('[data-visao]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.visao === estado.visao)));
    const f = filtrados();
    if (!f.quadras.length) {
      resumo(f, []);
      cal.replaceChildren(h('div', { class: 'vazio cal-vazio' }, ico('court'),
        h('b', {}, estado.dados.quadras.length ? 'Nenhuma quadra com esse filtro' : 'Sua arena ainda não tem quadras'),
        h('span', {}, estado.dados.quadras.length ? 'Escolha outra quadra ou modalidade.' : 'Cadastre quadras em Configurações › Quadras.')));
      return;
    }
    if (estado.visao === 'mes') return desenharMes(f);
    desenharLinhaDoTempo(f);
  }

  function blocoReserva(r, extra = {}) {
    const [cls, rot] = STATUS[r.status] || ['rd', r.status];
    return h('button', {
      type: 'button', class: `bloco ${cls}`, ...extra,
      title: `${r.cliente.nome} · ${r.modalidade} · ${rot}`,
      'aria-label': `${r.cliente.nome}, ${r.inicio.slice(11)} às ${r.fim.slice(11)}, ${r.modalidade}, ${rot}. Ver detalhes`,
      onclick: () => detalhes(r),
    }, h('b', {}, r.cliente.nome), h('small', {}, `${r.inicio.slice(11)}–${r.fim.slice(11)} · ${r.modalidade}`));
  }

  /** Dia (colunas = quadras) e semana (colunas = dias). */
  function desenharLinhaDoTempo(f) {
    const ag = estado.dados, { inicio, dias } = periodo();
    const datas = Array.from({ length: dias }, (_, i) => somarDias(inicio, i));
    resumo(f, datas);
    const agregado = estado.visao === 'semana' && f.quadras.length > 1; // semana com várias quadras: resumo por horário
    const colunas = estado.visao === 'dia'
      ? f.quadras.map((q) => ({ dia: estado.ref, quadras: [q], titulo: q.nome, sub: `${moeda(q.precoHora)}/h` }))
      : datas.map((d) => ({ dia: d, quadras: f.quadras, titulo: SEM[p(d).sem], sub: p(d).dia }));

    const iniH = Math.floor(Math.min(...f.quadras.map((q) => emMin(q.horaAbertura))) / 60);
    const fimH = Math.ceil(Math.max(...f.quadras.map(fechaMin)) / 60);
    const [diaAgora, minAgora] = [ag.agora.slice(0, 10), emMin(ag.agora.slice(11))];

    const grade = h('div', {
      class: `linha-tempo ${estado.visao}`, role: 'grid', 'aria-label': `Agenda: ${rotuloPeriodo()}`,
      style: `grid-template-columns:64px repeat(${colunas.length},minmax(${estado.visao === 'dia' ? 150 : 96}px,1fr));grid-template-rows:56px repeat(${fimH - iniH},52px)`,
    });
    grade.append(h('div', { class: 'canto', style: 'grid-row:1;grid-column:1' }, 'Hora'));
    colunas.forEach((c, i) => grade.append(h('div', {
      class: `dia ${estado.visao === 'semana' && c.dia === diaAgora ? 'hoje' : ''} ${estado.visao === 'dia' ? 'col-quadra' : ''}`,
      style: `grid-row:1;grid-column:${i + 2}`, role: 'columnheader',
    }, c.titulo, h(estado.visao === 'dia' ? 'small' : 'b', {}, c.sub))));

    for (let hr = iniH; hr < fimH; hr++) {
      const lin = hr - iniH + 2, s = hr * 60, e = s + 60;
      grade.append(h('div', { class: 'hora', style: `grid-row:${lin};grid-column:1`, role: 'rowheader' }, hhmm(s)));
      colunas.forEach((c, i) => {
        const pos = `grid-row:${lin};grid-column:${i + 2}`;
        const passado = c.dia < diaAgora || (c.dia === diaAgora && s < minAgora);
        const abertas = c.quadras.filter((q) => emMin(q.horaAbertura) <= s && e <= fechaMin(q));
        const agora = c.dia === diaAgora && s <= minAgora && minAgora < e ? ' agora-linha' : '';
        if (!agregado) {
          grade.append(h('div', { class: `fundo ${!abertas.length ? 'fechado' : passado ? 'passado-claro' : 'livre-claro'}${agora}`, style: pos }));
          return;
        }
        // Semana com várias quadras: quantas reservas e quantas livres naquele horário.
        const ocupam = f.reservas.filter((r) => minNoDia(r.inicio, c.dia) < e && minNoDia(r.fim, c.dia) > s);
        const bloqueadas = f.bloqueios.filter((b) => minNoDia(b.inicio, c.dia) < e && minNoDia(b.fim, c.dia) > s);
        const ocupadas = new Set([...ocupam, ...bloqueadas].map((x) => x.quadraId));
        const livres = abertas.filter((q) => !ocupadas.has(q.id)).length;
        const abrirDia = () => { estado.visao = 'dia'; estado.ref = c.dia; carregar(); };
        let conteudo;
        if (!abertas.length) conteudo = h('div', { class: 'passado' });
        else if (ocupam.length) conteudo = h('button', { type: 'button', class: 'agg', onclick: abrirDia, title: ocupam.map((r) => r.cliente.nome).join(', '),
          'aria-label': `${SEM[p(c.dia).sem]} ${p(c.dia).dia}, ${hhmm(s)}: ${ocupam.length} reserva(s), ${livres} livre(s). Abrir o dia` },
          h('b', {}, `${ocupam.length} reserva${ocupam.length > 1 ? 's' : ''}`), h('small', {}, livres ? `${livres} livre${livres > 1 ? 's' : ''}` : 'lotado'));
        else if (passado) conteudo = h('div', { class: 'passado' });
        else conteudo = h('button', { type: 'button', class: 'livre', onclick: abrirDia, 'aria-label': `${hhmm(s)}: ${livres} livre(s). Abrir o dia` },
          h('b', {}, livres), h('span', {}, livres > 1 ? 'livres' : 'livre'));
        grade.append(h('div', { class: `cel${agora}`, style: pos }, conteudo));
      });
    }

    if (!agregado) {
      // Blocos de reserva/bloqueio ocupando as horas da duração.
      const linha = (min) => Math.max(2, Math.min(fimH - iniH + 2, Math.round(min / 60 - iniH) + 2));
      colunas.forEach((c, i) => {
        const q = c.quadras.map((x) => x.id);
        for (const r of f.reservas.filter((x) => q.includes(x.quadraId))) {
          const a = linha(minNoDia(r.inicio, c.dia)), b = linha(minNoDia(r.fim, c.dia));
          if (b > a) grade.append(blocoReserva(r, { style: `grid-row:${a}/${b};grid-column:${i + 2}` }));
        }
        for (const bq of f.bloqueios.filter((x) => q.includes(x.quadraId))) {
          const a = linha(minNoDia(bq.inicio, c.dia)), b = linha(minNoDia(bq.fim, c.dia));
          if (b > a) grade.append(h('div', { class: 'bloco bloq', style: `grid-row:${a}/${b};grid-column:${i + 2}` },
            ico('lock', 'ico p'), h('b', {}, 'Bloqueado'), bq.descricao && h('small', {}, bq.descricao)));
        }
      });
    }

    $('#dica-visao').textContent = agregado
      ? 'Clique num horário para ver o dia com todas as quadras.'
      : 'Clique numa reserva para ver os detalhes do cliente.';
    cal.replaceChildren(grade);
    // Rola até a primeira reserva ou até o horário atual.
    cal.scrollTop = 0;
    const alvo = grade.querySelector('.bloco, .agg, .agora-linha');
    if (alvo) cal.scrollTop = Math.max(0, alvo.getBoundingClientRect().top - cal.getBoundingClientRect().top - 64);
    cal.scrollLeft = 0;
    const hoje = grade.querySelector('.dia.hoje');
    if (hoje) cal.scrollLeft = Math.max(0, hoje.getBoundingClientRect().left - cal.getBoundingClientRect().left - 64);
  }

  /** Mês: grade de dias com as reservas resumidas; clicar abre o dia. */
  function desenharMes(f) {
    const { inicio, primeiro } = periodo();
    const mes = p(primeiro).mes, diaAgora = estado.dados.agora.slice(0, 10);
    const datas = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
    resumo(f, datas.filter((d) => p(d).mes === mes));
    const grade = h('div', { class: 'mes', role: 'grid', 'aria-label': rotuloPeriodo() },
      ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => h('div', { class: 'mes-cab', role: 'columnheader' }, d)));
    for (const d of datas) {
      const rs = f.reservas.filter((r) => r.inicio.startsWith(d));
      const fora = p(d).mes !== mes;
      const lista = rs.slice(0, 3).map((r) => h('span', { class: `mes-item ${STATUS[r.status]?.[0] || ''}` }, h('i'), `${r.inicio.slice(11)} ${r.cliente.nome.split(' ')[0]}`));
      grade.append(h('button', {
        type: 'button', class: `mes-dia ${fora ? 'fora' : ''} ${d === diaAgora ? 'hoje' : ''}`,
        'aria-label': `${p(d).dia} de ${MES_LONGO[p(d).mes]}: ${rs.length} reserva(s). Abrir o dia`,
        onclick: () => { estado.visao = 'dia'; estado.ref = d; carregar(); },
      }, h('span', { class: 'mes-num' }, p(d).dia), rs.length > 0 && h('span', { class: 'mes-qtd' }, `${rs.length} reserva${rs.length > 1 ? 's' : ''}`),
      lista, rs.length > 3 && h('span', { class: 'mes-mais' }, `+${rs.length - 3} mais`)));
    }
    $('#dica-visao').textContent = 'Clique num dia para ver a agenda completa dele.';
    cal.replaceChildren(grade);
    cal.scrollTop = 0;
  }

  /* ---------- Detalhes ---------- */
  function detalhes(r) {
    const q = estado.dados.quadras.find((x) => x.id === r.quadraId);
    const [, rot] = STATUS[r.status] || ['', r.status];
    const d = p(r.inicio.slice(0, 10));
    $('#det-tit').textContent = r.cliente.nome;
    $('#det-sub').textContent = `${q?.nome ?? ''} · ${SEM_LONGO[d.sem]}, ${d.dia} ${MES[d.mes]}, ${r.inicio.slice(11)}–${r.fim.slice(11)}`;
    const linhas = [
      ['Telefone', telefone(r.cliente.telefone)], ['E-mail', r.cliente.email], ['Quadra', q?.nome ?? '—'], ['Modalidade', r.modalidade],
      ['Horário', `${r.inicio.slice(11)} – ${r.fim.slice(11)}`], ['Valor', moeda(r.valorTotal)], ['Status', rot],
      ['Origem', r.origem === 'balcao' ? 'Balcão' : 'Online'], ['Criada em', r.criadoEm ? `${r.criadoEm.slice(8, 10)}/${r.criadoEm.slice(5, 7)} ${r.criadoEm.slice(11, 16)}` : '—'],
    ];
    $('#det-lista').replaceChildren(...linhas.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
    $('#dlg-det').showModal();
  }

  /* ---------- Controles ---------- */
  $('#f-quadra').addEventListener('change', (e) => { estado.quadra = e.target.value === 'todas' ? 'todas' : Number(e.target.value); desenhar(); });
  $('#f-mod').addEventListener('change', (e) => { estado.mod = e.target.value === 'todas' ? 'todas' : Number(e.target.value); desenhar(); });
  document.querySelectorAll('[data-visao]').forEach((b) => b.addEventListener('click', () => { estado.visao = b.dataset.visao; carregar(); }));
  $('#p-hoje').addEventListener('click', () => { estado.ref = hojeLocal(); carregar(); });
  $('#p-ant').addEventListener('click', () => mover(-1));
  $('#p-prox').addEventListener('click', () => mover(1));

  carregar();
})();
