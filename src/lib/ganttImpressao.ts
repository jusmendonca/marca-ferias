import { diasBloqueados } from './bloqueios';
import { diaDaSemana, diasCorridos, formatarBR, somarDias } from './datas';
import { indiceDia, INICIO_GANTT, meses, totalDiasGantt } from './escala';
import { periodosDe, procuradoresDoSetor, setoresOrdenados } from './ocupacao';
import { statusProcurador } from './regras';
import { ROTULO_RECESSO } from './rotulos';
import type { DadosPublicos, Periodo } from './tipos';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s: string) => s.replace(/[&<>"]/g, c => ESCAPES[c]);

function pos(p: Periodo): string | null {
  const n = totalDiasGantt();
  const ini = Math.max(indiceDia(p.inicio), 0);
  const fim = Math.min(indiceDia(p.fim), n - 1);
  if (fim < ini) return null;
  return `left:${(ini / n) * 100}%;width:${((fim - ini + 1) / n) * 100}%`;
}

function barra(classe: string, p: Periodo, titulo: string): string {
  const estilo = pos(p);
  return estilo ? `<i class="${classe}" style="${estilo}" title="${esc(titulo)}"></i>` : '';
}

function fundo(dados: DadosPublicos): string {
  const especiais = new Map(dados.dias_especiais.map(d => [d.data, d.tipo]));
  let html = '';
  for (let i = 0; i < totalDiasGantt(); i++) {
    const dia = somarDias(INICIO_GANTT, i);
    const dow = diaDaSemana(dia);
    const classe = especiais.get(dia) ?? (dow === 0 || dow === 6 ? 'fds' : null);
    if (classe) html += barra(`f ${classe}`, { inicio: dia, fim: dia }, '');
  }
  return html;
}

const ESTILO = `
@page { size: A4 landscape; margin: 10mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font: 11px/1.3 system-ui, Arial, sans-serif; color: #1c2430; margin: 0; }
h1 { font-size: 16px; margin: 0 0 2px; } .sub { color: #5a6577; margin: 0 0 8px; }
h2 { font-size: 12px; margin: 10px 0 3px; } section { break-inside: avoid; }
.linha { display: flex; border-bottom: 1px solid #e3e7ed; }
.nome { width: 52mm; flex: none; padding: 2px 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nome small { display: block; color: #5a6577; font-size: 8px; }
.trilha { position: relative; flex: 1; height: 22px; border-left: 1px solid #c9d0da; }
.cab .trilha { height: 14px; }
.mes { position: absolute; top: 0; bottom: 0; border-left: 1px solid #c9d0da; font-size: 8px; padding-left: 2px; overflow: hidden; white-space: nowrap; }
i { position: absolute; display: block; } .f { top: 0; bottom: 0; }
.fds { background: rgba(120,130,150,.14); } .feriado { background: rgba(225,140,30,.3); } .facultativo { background: rgba(225,190,30,.28); }
.ferias { top: 5px; height: 12px; background: #2f7de1; border-radius: 2px; }
.bloqueio { top: 5px; height: 12px; background: rgba(47,125,225,.4); border: 1px solid #2f7de1; }
.recesso { top: 5px; height: 12px; background: repeating-linear-gradient(45deg, #8a5cf6 0 3px, transparent 3px 6px); border: 1px solid #8a5cf6; }
.legenda { display: flex; gap: 14px; margin-top: 10px; font-size: 9px; align-items: center; }
.legenda i { position: static; display: inline-block; width: 16px; height: 9px; vertical-align: middle; margin-right: 3px; border-radius: 2px; }
`;

/** Documento HTML autocontido do Gantt (férias, bloqueios e recesso), próprio para imprimir em A4 paisagem. */
export function gerarGanttImpressao(dados: DadosPublicos, setorId: number | null = null): string {
  const n = totalDiasGantt();
  const cab = meses().map(m =>
    `<div class="mes" style="left:${(m.inicio / n) * 100}%;width:${(m.dias / n) * 100}%">${m.dias >= 10 ? m.rotulo : ''}</div>`).join('');
  const bg = fundo(dados);

  const secoes = setoresOrdenados(dados).filter(s => setorId === null || s.id === setorId).map(s => {
    const procs = procuradoresDoSetor(dados, s.id);
    if (!procs.length) return '';
    const linhas = procs.map(p => {
      const periodos = periodosDe(dados, p.id);
      let barras = '';
      for (const per of periodos) {
        for (const dia of diasBloqueados(per, dados)) {
          barras += barra('bloqueio', { inicio: dia, fim: dia }, `Bloqueio de distribuição: ${formatarBR(dia)}`);
        }
      }
      for (const per of periodos) {
        barras += barra('ferias', per, `${formatarBR(per.inicio)} a ${formatarBR(per.fim)} (${diasCorridos(per)} dias)`);
      }
      if (p.recesso) {
        const r = dados.recesso[p.recesso];
        barras += barra('recesso', r, `Recesso ${ROTULO_RECESSO[p.recesso]}: ${formatarBR(r.inicio)} a ${formatarBR(r.fim)}`);
      }
      const datas = periodos.map(x => `${formatarBR(x.inicio).slice(0, 5)}–${formatarBR(x.fim).slice(0, 5)}`).join(', ');
      const status = statusProcurador(periodos, p.recesso);
      const detalhe = `${datas || 'sem férias marcadas'}${p.recesso ? ` · recesso ${ROTULO_RECESSO[p.recesso]}` : ''}`;
      return `<div class="linha"><div class="nome">${esc(p.nome)}<small class="${status}">${esc(detalhe)}</small></div><div class="trilha">${bg}${barras}</div></div>`;
    }).join('');
    return `<section><h2>${esc(s.nome)} (${procs.length})</h2><div class="linha cab"><div class="nome"></div><div class="trilha">${cab}</div></div>${linhas}</section>`;
  }).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Gantt de férias 2027</title><style>${ESTILO}</style></head><body>
<h1>Férias 2027 — Núcleo de Educação (EFIN1)</h1><p class="sub">Gantt de 21/12/2026 a 31/12/2027 · gerado em ${formatarBR(new Date().toISOString().slice(0, 10))}</p>
${secoes || '<p>Nenhum procurador para exibir.</p>'}
<div class="legenda"><span><i class="ferias"></i>Férias</span><span><i class="bloqueio"></i>Bloqueio de distribuição</span><span><i class="recesso"></i>Recesso</span><span><i class="fds"></i>Fim de semana</span><span><i class="feriado"></i>Feriado</span><span><i class="facultativo"></i>Ponto facultativo</span></div>
</body></html>`;
}
