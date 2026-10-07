// Datas e horas no fuso da arena. Tudo é tratado como texto 'AAAA-MM-DD HH:MM'
// (ordenável e comparável diretamente no SQL) e convertido para minutos quando é preciso somar.
const FUSO = process.env.ARENA_TZ || 'America/Sao_Paulo';
const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

const fmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Agora, no fuso da arena: 'AAAA-MM-DD HH:MM'. */
const agora = () => fmt.format(new Date()).replace('T', ' ').slice(0, 16);

/** 'HH:MM' -> minutos desde 00:00 (ou NaN). */
const horaEmMin = (h) => {
  const m = HORA_RE.exec(String(h ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const minEmHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Data válida de calendário? ('2026-02-30' não é.) */
const dataValida = (d) => {
  if (!DATA_RE.test(String(d ?? ''))) return false;
  const [a, m, dia] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, dia));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === dia;
};

/** 'AAAA-MM-DD HH:MM' -> minutos absolutos (para somar/subtrair horas sem depender do fuso do servidor). */
const emMin = (s) => {
  const [d, h] = s.split(' ');
  const [a, m, dia] = d.split('-').map(Number);
  return Date.UTC(a, m - 1, dia) / 60000 + horaEmMin(h);
};
const deMin = (min) => new Date(min * 60000).toISOString().slice(0, 16).replace('T', ' ');
const somarMin = (s, min) => deMin(emMin(s) + min);
const somarDias = (dia, n) => deMin(emMin(`${dia} 00:00`) + n * 1440).slice(0, 10);

module.exports = { FUSO, HORA_RE, agora, horaEmMin, minEmHora, dataValida, emMin, somarMin, somarDias };
