import { formatarBR } from '../lib/datas';
import { periodosCriticos } from '../lib/criticos';
import { setoresOrdenados } from '../lib/ocupacao';
import type { DadosPublicos } from '../lib/tipos';
import { h } from './dom';

export const LIMITES: { valor: number; rotulo: string }[] = [
  { valor: 50, rotulo: 'Abaixo de 50% presentes' },
  { valor: 70, rotulo: 'Abaixo de 70% presentes (mínimo da IN)' },
  { valor: 101, rotulo: 'Qualquer ausência' },
];

const ROTULO_MOTIVO = { ferias: 'férias', recesso: 'recesso', bloqueio: 'bloqueio' } as const;

export function renderCriticos(dados: DadosPublicos, setorId: number | null, limite: number): HTMLElement {
  const linhas: HTMLElement[] = [];
  for (const s of setoresOrdenados(dados).filter(x => setorId === null || x.id === setorId)) {
    for (const t of periodosCriticos(dados, s.id, limite)) {
      const periodo = t.inicio === t.fim ? formatarBR(t.inicio) : `${formatarBR(t.inicio)} a ${formatarBR(t.fim)}`;
      linhas.push(h('tr', {},
        h('td', {}, s.nome),
        h('td', {}, periodo),
        h('td', { class: 'num' }, String(t.diasUteis)),
        h('td', { class: 'num' }, h('strong', {}, `${Math.round(t.pct)}%`), ` (${t.presentes}/${t.total})`),
        h('td', {}, t.ausentes.map(a => `${a.procurador.nome} (${ROTULO_MOTIVO[a.motivo]})`).join(', '))));
    }
  }

  return linhas.length
    ? h('div', { class: 'tabela-rolavel' }, h('table', { class: 'criticos' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Setor'), h('th', {}, 'Período'), h('th', { class: 'num' }, 'Dias úteis'),
        h('th', { class: 'num' }, 'Presentes'), h('th', {}, 'Ausentes'))),
      h('tbody', {}, ...linhas)))
    : h('p', { class: 'dica' }, 'Nenhum período nesse critério.');
}
