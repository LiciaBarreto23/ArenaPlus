const PERFIS = { usuario: 'Atleta', funcionario: 'Funcionário', administrador: 'Administrador' };
const el = (id) => document.getElementById(id);

(async () => {
  const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (!r.ok) return (location.href = '/login');
  const { usuario: u, inicio } = await r.json();
  if (inicio && inicio !== '/painel') return location.replace(inicio); // atleta e administrador têm tela própria
  el('saudacao').textContent = `Olá, ${u.nome.split(' ')[0]}`;
  const linhas = [['Perfil', PERFIS[u.perfil]], ['E-mail', u.email], ['Telefone', u.telefone]];
  if (u.nomeArena) linhas.push(['Arena', u.nomeArena]);
  el('dados').replaceChildren(...linhas.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v ?? '—';
    return [dt, dd];
  }));
})();

el('sair').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.href = '/login';
});
