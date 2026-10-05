import { diaDaSemana, diasCorridos, formatarBR, somarDias } from '../lib/datas';
import { geometria, INICIO_GANTT, meses, PX_POR_DIA, totalDiasGantt, type Zoom } from '../lib/escala';
import { ausenciasNoDia, periodosDe, procuradoresDoSetor, setoresOrdenados } from '../lib/ocupacao';
import { statusProcurador } from '../lib/regras';
import { ROTULO_RECESSO } from '../lib/rotulos';
import type { DadosPublicos, Procurador } from '../lib/tipos';
import { h } from './dom';

export interface OpcoesGantt {
  zoom: Zoom;
  setorId: number | null;
  aoClicarProcurador: (id: number) => void;
}

export function renderGantt(dados: DadosPublicos, op: OpcoesGantt): HTMLElement {
  const px = PX_POR_DIA[op.zoom];
  const n = totalDiasGantt();
  const grade = h('div', { class: 'gantt-grade', style: `--trilha:${n * px}px` });

  grade.append(fundo(dados, px, n), cabecalho(op.zoom, px, n));

  const setores = setoresOrdenados(dados).filter(s => op.setorId === null || s.id === op.setorId);
  for (const s of setores) {
    const procs = procuradoresDoSetor(dados, s.id);
    grade.append(h('div', { class: 'linha setor-titulo' },
      h('div', { class: 'rotulo' }, `${s.nome} (${procs.length})`),
      h('div', { class: 'trilha' })));
    for (const p of procs) grade.append(linhaProcurador(dados, p, op));
    if (procs.length) grade.append(linhaOcupacao(dados, s.id, op.zoom, px, n));
  }

  return h('div', { class: 'gantt' }, grade);
}

function fundo(dados: DadosPublicos, px: number, n: number): HTMLElement {
  const especiais = new Map(dados.dias_especiais.map(d => [d.data, d.tipo]));
  const el = h('div', { class: 'gantt-fundo', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    const dia = somarDias(INICIO_GANTT, i);
    const dow = diaDaSemana(dia);
    const classe = especiais.get(dia) ?? (dow === 0 || dow === 6 ? 'fds' : null);
    if (classe) el.append(h('div', { class: `faixa ${classe}`, style: `left:${i * px}px;width:${px}px` }));
  }
  return el;
}

function cabecalho(zoom: Zoom, px: number, n: number): HTMLElement {
  const trilha = h('div', { class: 'trilha' });
  for (const m of meses()) {
    const cabe = zoom !== 'ano' || m.dias >= 15;
    trilha.append(h('div', { class: 'mes', style: `left:${m.inicio * px}px;width:${m.dias * px}px` }, cabe ? m.rotulo : ''));
  }
  if (zoom === 'mes') {
    for (let i = 0; i < n; i++) {
      trilha.append(h('div', { class: 'num-dia', style: `left:${i * px}px;width:${px}px` }, somarDias(INICIO_GANTT, i).slice(8)));
    }
  }
  return h('div', { class: 'linha cabecalho' }, h('div', { class: 'rotulo' }, 'Procurador'), trilha);
}

function linhaProcurador(dados: DadosPublicos, p: Procurador, op: OpcoesGantt): HTMLElement {
  const periodos = periodosDe(dados, p.id);
  const status = statusProcurador(periodos, p.recesso);
  const trilha = h('div', { class: 'trilha' });

  for (const per of periodos) {
    const g = geometria(per, op.zoom);
    if (!g) continue;
    const texto = `${p.nome}: ${formatarBR(per.inicio)} a ${formatarBR(per.fim)} (${diasCorridos(per)} dias)`;
    trilha.append(h('button', {
      type: 'button', class: 'barra ferias', style: `left:${g.left}px;width:${g.width}px`,
      title: texto, 'aria-label': texto, onclick: () => op.aoClicarProcurador(p.id),
    }));
  }

  if (p.recesso) {
    const r = dados.recesso[p.recesso];
    const g = geometria(r, op.zoom);
    if (g) {
      trilha.append(h('div', {
        class: 'barra recesso', style: `left:${g.left}px;width:${g.width}px`,
        title: `${p.nome}: recesso (${ROTULO_RECESSO[p.recesso]}) ${formatarBR(r.inicio)} a ${formatarBR(r.fim)}`,
      }));
    }
  }

  return h('div', { class: 'linha' },
    h('button', { type: 'button', class: 'rotulo rotulo-proc', onclick: () => op.aoClicarProcurador(p.id) },
      p.nome, h('span', { class: `selo ${status}` }, status)),
    trilha);
}

function linhaOcupacao(dados: DadosPublicos, setorId: number, zoom: Zoom, px: number, n: number): HTMLElement {
  const trilha = h('div', { class: 'trilha' });
  for (let i = 0; i < n; i++) {
    const dia = somarDias(INICIO_GANTT, i);
    const o = ausenciasNoDia(dados, setorId, dia);
    const alfa = o.total ? ((o.total - o.presentes) / o.total) * 0.9 : 0;
    const fora = o.ausentes.map(a => a.procurador.nome + (a.motivo === 'recesso' ? ' (recesso)' : '')).join(', ');
    trilha.append(h('div', {
      class: 'celula',
      style: `left:${i * px}px;width:${px}px;background-color:rgba(var(--calor-rgb),${alfa.toFixed(2)})`,
      title: `${formatarBR(dia)}: ${o.presentes}/${o.total} presentes${fora ? ' — fora: ' + fora : ''}`,
    }, zoom === 'mes' ? String(o.presentes) : ''));
  }
  return h('div', { class: 'linha ocupacao' }, h('div', { class: 'rotulo' }, 'Presentes no setor'), trilha);
}
