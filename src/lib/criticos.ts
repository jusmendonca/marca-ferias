import { ehDiaUtil } from './bloqueios';
import { paraNumero, somarDias } from './datas';
import { FIM_GANTT, INICIO_GANTT } from './escala';
import { ausenciasNoDia, procuradoresDoSetor, type Ausencia } from './ocupacao';
import type { DadosPublicos, DataISO } from './tipos';

export interface TrechoSetor {
  setorId: number;
  inicio: DataISO;
  fim: DataISO;
  diasUteis: number;
  total: number;
  presentes: number;
  /** Percentual de procuradores presentes (0–100). */
  pct: number;
  ausentes: Ausencia[];
}

/**
 * Trechos de dias úteis consecutivos em que o setor tem exatamente os mesmos ausentes
 * (férias, recesso ou bloqueio). Fins de semana e feriados não quebram o trecho.
 */
export function trechosDoSetor(dados: DadosPublicos, setorId: number): TrechoSetor[] {
  const total = procuradoresDoSetor(dados, setorId).length;
  if (!total) return [];
  const naoUteis = new Set(dados.dias_especiais.map(d => d.data));
  const trechos: (TrechoSetor & { chave: string })[] = [];
  const n = paraNumero(FIM_GANTT) - paraNumero(INICIO_GANTT) + 1;

  for (let i = 0; i < n; i++) {
    const dia = somarDias(INICIO_GANTT, i);
    if (!ehDiaUtil(dia, naoUteis)) continue;
    const o = ausenciasNoDia(dados, setorId, dia);
    const chave = o.ausentes.map(a => `${a.procurador.id}:${a.motivo}`).join(',');
    const ultimo = trechos[trechos.length - 1];
    if (ultimo && ultimo.chave === chave) {
      ultimo.fim = dia;
      ultimo.diasUteis++;
    } else {
      trechos.push({
        chave, setorId, inicio: dia, fim: dia, diasUteis: 1, total,
        presentes: o.presentes, pct: (o.presentes / total) * 100, ausentes: o.ausentes,
      });
    }
  }
  return trechos.map(({ chave: _, ...t }) => t);
}

/** Trechos com presença abaixo de `limitePct` (use 101 para listar qualquer ausência). */
export function periodosCriticos(dados: DadosPublicos, setorId: number, limitePct: number): TrechoSetor[] {
  return trechosDoSetor(dados, setorId).filter(t => t.pct < limitePct && t.ausentes.length > 0);
}
