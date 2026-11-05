import { diasBloqueados } from './bloqueios';
import { trechosDoSetor } from './criticos';
import { diaDaSemana, diasCorridos, formatarBR, somarDias } from './datas';
import { indiceDia, INICIO_GANTT, meses, totalDiasGantt } from './escala';
import { ausenciasNoDia, periodosDe, procuradoresDoSetor, setoresOrdenados } from './ocupacao';
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

function barra(classe: string, p: Periodo, titulo: string, extra = '', texto = ''): string {
  const estilo = pos(p);
  return estilo ? `<i class="${classe}" style="${extra}${estilo}" title="${esc(titulo)}">${texto}</i>` : '';
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

const MIN_DIAS_COM_TEXTO = 6;
const MINIMO_PRESENCA_PCT = 70;
const MOTIVO = { ferias: 'férias', recesso: 'recesso', bloqueio: 'bloqueio' } as const;

/** Discriminação dos períodos em que o setor tem ausências, com percentual e número de presentes. */
function tabelaAusencias(dados: DadosPublicos, setorId: number): string {
  const trechos = trechosDoSetor(dados, setorId).filter(t => t.ausentes.length > 0);
  if (!trechos.length) return '<p class="dica">Nenhuma ausência no setor.</p>';
  const linhas = trechos.map(t => {
    const periodo = t.inicio === t.fim ? formatarBR(t.inicio) : `${formatarBR(t.inicio)} a ${formatarBR(t.fim)}`;
    const nomes = t.ausentes.map(a => `${esc(a.procurador.nome)} (${MOTIVO[a.motivo]})`).join(', ');
    const critico = t.pct < MINIMO_PRESENCA_PCT ? ' class="critico"' : '';
    return `<tr${critico}><td>${periodo}</td><td class="n">${t.diasUteis}</td><td class="n"><b>${Math.round(t.pct)}%</b></td><td class="n">${t.presentes} de ${t.total}</td><td class="n">${t.ausentes.length}</td><td>${nomes}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Período (dias úteis)</th><th class="n">Dias úteis</th><th class="n">Presentes (%)</th><th class="n">Presentes</th><th class="n">Ausentes</th><th>Quem está ausente</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

/** Linha "Presentes no setor": vermelho mais forte quanto maior a fração de ausentes (mesma escala da tela). */
function linhaOcupacao(dados: DadosPublicos, setorId: number): string {
  let html = '';
  let ini = 0;
  let alfaAtual = -1;
  let rotulo = '';
  let pctAtual = 100;
  const fechar = (fim: number) => {
    if (alfaAtual < 0) return;
    // O percentual só cabe escrito em trechos longos; nos curtos fica no tooltip.
    const texto = fim - ini + 1 >= MIN_DIAS_COM_TEXTO ? `${pctAtual}%` : '';
    const cor = alfaAtual > 0.5 ? '#fff' : '#1c2430';
    html += barra('calor', { inicio: somarDias(INICIO_GANTT, ini), fim: somarDias(INICIO_GANTT, fim) }, rotulo,
      `background:rgba(220,38,38,${alfaAtual});color:${cor};`, texto);
  };
  for (let i = 0; i < totalDiasGantt(); i++) {
    const o = ausenciasNoDia(dados, setorId, somarDias(INICIO_GANTT, i));
    const alfa = o.total ? Math.round(((o.total - o.presentes) / o.total) * 0.9 * 100) / 100 : 0;
    if (alfa !== alfaAtual) {
      if (i > 0) fechar(i - 1);
      ini = i;
      alfaAtual = alfa;
      pctAtual = Math.round((o.presentes / (o.total || 1)) * 100);
      rotulo = `${o.presentes}/${o.total} presentes (${pctAtual}%)`;
    }
  }
  fechar(totalDiasGantt() - 1);
  return `<div class="linha oc"><div class="nome">Presentes no setor<small>percentual de quem fica</small></div><div class="trilha">${html}</div></div>`;
}

const ESTILO = `
@page { size: 297mm 210mm; margin: 10mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font: 11px/1.3 system-ui, Arial, sans-serif; color: #1c2430; margin: 0; }
h1 { font-size: 16px; margin: 0 0 2px; } .sub { color: #5a6577; margin: 0 0 8px; }
h2 { font-size: 12px; margin: 10px 0 3px; } section { break-inside: avoid; } h2 { break-after: avoid; }
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
.oc .trilha { height: 14px; } .oc .nome { font-size: 9px; } .calor { top: 0; bottom: 0; font-size: 7px; line-height: 14px; text-align: center; overflow: hidden; }
h3 { font-size: 11px; margin: 8px 0 3px; }
table { border-collapse: collapse; width: 100%; font-size: 9px; margin-bottom: 6px; } thead { display: table-header-group; } tr { break-inside: avoid; }
th, td { text-align: left; padding: 2px 5px; border-bottom: 1px solid #e3e7ed; } th { background: #f0f3f7; } .n { text-align: right; white-space: nowrap; }
tr.critico td { color: #b42318; } .dica { font-size: 9px; color: #5a6577; }
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
    return `<section><h2>${esc(s.nome)} (${procs.length})</h2><div class="linha cab"><div class="nome"></div><div class="trilha">${cab}</div></div>${linhas}${linhaOcupacao(dados, s.id)}</section><h3>Períodos de ausência — ${esc(s.nome)}</h3>${tabelaAusencias(dados, s.id)}`;
  }).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Gantt de férias 2027</title><style>${ESTILO}</style></head><body>
<h1>Férias 2027 — Núcleo de Educação (EFIN1)</h1><p class="sub">Gantt de 21/12/2026 a 31/12/2027 · gerado em ${formatarBR(new Date().toISOString().slice(0, 10))}</p>
${secoes || '<p>Nenhum procurador para exibir.</p>'}
<div class="legenda"><span><i class="ferias"></i>Férias</span><span><i class="bloqueio"></i>Bloqueio de distribuição</span><span><i class="recesso"></i>Recesso</span><span><i class="calor" style="background:linear-gradient(90deg,rgba(220,38,38,.15),rgba(220,38,38,.9));width:36px"></i>Presentes no setor (% de quem fica; mais vermelho = mais ausentes)</span><span class="crit">Linhas em vermelho: presença abaixo de 70% (mínimo da IN)</span><span><i class="fds"></i>Fim de semana</span><span><i class="feriado"></i>Feriado</span><span><i class="facultativo"></i>Ponto facultativo</span></div>
</body></html>`;
}
