import { contem, sobrepoe } from './datas';
import type { DadosPublicos, DataISO, Periodo, PeriodoFerias, Procurador, Setor } from './tipos';

export interface Ausencia {
  procurador: Procurador;
  motivo: 'ferias' | 'recesso';
}

export interface OcupacaoDia {
  total: number;
  presentes: number;
  ausentes: Ausencia[];
}

export interface ColegaFora {
  nome: string;
  inicio: DataISO;
  fim: DataISO;
  motivo: 'ferias' | 'recesso';
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR');

export function setoresOrdenados(d: DadosPublicos): Setor[] {
  return [...d.setores].sort((a, b) => a.ordem - b.ordem || porNome(a, b));
}

export function procuradoresDoSetor(d: DadosPublicos, setorId: number): Procurador[] {
  return d.procuradores.filter(p => p.ativo && p.setor_id === setorId).sort(porNome);
}

export function periodosDe(d: DadosPublicos, procuradorId: number): PeriodoFerias[] {
  return d.periodos.filter(p => p.procurador_id === procuradorId).sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export function ausenciasNoDia(d: DadosPublicos, setorId: number, dia: DataISO): OcupacaoDia {
  const procs = procuradoresDoSetor(d, setorId);
  const ausentes: Ausencia[] = [];
  for (const p of procs) {
    if (d.periodos.some(x => x.procurador_id === p.id && contem(x, dia))) ausentes.push({ procurador: p, motivo: 'ferias' });
    else if (p.recesso && contem(d.recesso[p.recesso], dia)) ausentes.push({ procurador: p, motivo: 'recesso' });
  }
  return { total: procs.length, presentes: procs.length - ausentes.length, ausentes };
}

export function colegasFora(d: DadosPublicos, setorId: number, periodo: Periodo, excetoId: number): ColegaFora[] {
  const r: ColegaFora[] = [];
  for (const p of procuradoresDoSetor(d, setorId)) {
    if (p.id === excetoId) continue;
    for (const x of periodosDe(d, p.id)) {
      if (sobrepoe(x, periodo)) r.push({ nome: p.nome, inicio: x.inicio, fim: x.fim, motivo: 'ferias' });
    }
    if (p.recesso) {
      const rec = d.recesso[p.recesso];
      if (sobrepoe(rec, periodo)) r.push({ nome: p.nome, inicio: rec.inicio, fim: rec.fim, motivo: 'recesso' });
    }
  }
  return r.sort((a, b) => a.inicio.localeCompare(b.inicio) || porNome(a, b));
}
