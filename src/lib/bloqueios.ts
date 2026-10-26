import { diaDaSemana, diasCorridos, somarDias } from './datas';
import { periodoValido } from './regras';
import type { DadosPublicos, DataISO, Periodo } from './tipos';

/** Quadro da instrução normativa: [mínimo de dias de férias, dias úteis de bloqueio], em ordem crescente. */
const QUADRO: readonly (readonly [number, number])[] = [
  [1, 0], [2, 1], [5, 2], [7, 3], [10, 4], [12, 5], [14, 6], [17, 7], [19, 8], [22, 9], [25, 10],
];

export function diasDeBloqueio(diasDeFerias: number): number {
  let bloqueio = 0;
  for (const [minimo, dias] of QUADRO) if (diasDeFerias >= minimo) bloqueio = dias;
  return bloqueio;
}

/** Dia útil = não é fim de semana, feriado nem ponto facultativo. */
export function ehDiaUtil(dia: DataISO, naoUteis: ReadonlySet<DataISO>): boolean {
  const dow = diaDaSemana(dia);
  return dow !== 0 && dow !== 6 && !naoUteis.has(dia);
}

/** Dias úteis imediatamente anteriores ao início das férias, em ordem cronológica. */
export function diasBloqueados(p: Periodo, dados: Pick<DadosPublicos, 'dias_especiais'>): DataISO[] {
  if (!periodoValido(p)) return [];
  const naoUteis = new Set(dados.dias_especiais.map(d => d.data));
  const falta = diasDeBloqueio(diasCorridos(p));
  const dias: DataISO[] = [];
  let dia = p.inicio;
  while (dias.length < falta) {
    dia = somarDias(dia, -1);
    if (ehDiaUtil(dia, naoUteis)) dias.unshift(dia);
  }
  return dias;
}
