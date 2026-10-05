import { deNumero, paraNumero } from './datas';
import type { DataISO, Periodo } from './tipos';

export const INICIO_GANTT = '2026-12-21';
export const FIM_GANTT = '2027-12-31';

export type Zoom = 'ano' | 'trimestre' | 'mes';

export const PX_POR_DIA: Record<Zoom, number> = { ano: 3, trimestre: 10, mes: 32 };
export const ROTULO_ZOOM: Record<Zoom, string> = { ano: 'Ano', trimestre: 'Trimestre', mes: 'Mês' };

const BASE = paraNumero(INICIO_GANTT);
const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export interface SegmentoMes {
  rotulo: string;
  inicio: number;
  dias: number;
}

export function totalDiasGantt(): number {
  return paraNumero(FIM_GANTT) - BASE + 1;
}

export function indiceDia(dia: DataISO): number {
  return paraNumero(dia) - BASE;
}

export function geometria(p: Periodo, zoom: Zoom): { left: number; width: number } | null {
  const ini = Math.max(indiceDia(p.inicio), 0);
  const fim = Math.min(indiceDia(p.fim), totalDiasGantt() - 1);
  if (fim < ini) return null;
  const px = PX_POR_DIA[zoom];
  return { left: ini * px, width: (fim - ini + 1) * px };
}

export function meses(): SegmentoMes[] {
  const r: SegmentoMes[] = [];
  const total = totalDiasGantt();
  let i = 0;
  while (i < total) {
    const [a, m] = deNumero(BASE + i).split('-').map(Number);
    const proximo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
    const dias = Math.min(paraNumero(proximo) - (BASE + i), total - i);
    r.push({ rotulo: `${NOMES_MES[m - 1]}/${String(a).slice(2)}`, inicio: i, dias });
    i += dias;
  }
  return r;
}
