import type { DataISO, Periodo } from './tipos';

const DIA_MS = 86_400_000;
const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

export function ehDataValida(s: string): boolean {
  if (!FORMATO.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Número de dias desde 1970-01-01 (UTC). */
export function paraNumero(s: DataISO): number {
  const [a, m, d] = s.split('-').map(Number);
  return Date.UTC(a, m - 1, d) / DIA_MS;
}

export function deNumero(n: number): DataISO {
  return new Date(n * DIA_MS).toISOString().slice(0, 10);
}

export function somarDias(s: DataISO, n: number): DataISO {
  return deNumero(paraNumero(s) + n);
}

export function diasCorridos(p: Periodo): number {
  return paraNumero(p.fim) - paraNumero(p.inicio) + 1;
}

export function sobrepoe(a: Periodo, b: Periodo): boolean {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

export function contem(p: Periodo, dia: DataISO): boolean {
  return p.inicio <= dia && dia <= p.fim;
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(s: DataISO): number {
  return new Date(paraNumero(s) * DIA_MS).getUTCDay();
}

export function formatarBR(s: DataISO): string {
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
}
