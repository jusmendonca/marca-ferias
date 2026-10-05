import { diasCorridos, ehDataValida, sobrepoe } from './datas';
import type { DatasRecesso, Periodo, Recesso } from './tipos';

export const INICIO_ANO = '2027-01-01';
export const FIM_ANO = '2027-12-31';
export const MAX_DIAS = 30;

export type Status = 'completo' | 'pendente';

export function periodoValido(p: Periodo): boolean {
  return ehDataValida(p.inicio) && ehDataValida(p.fim) && p.fim >= p.inicio;
}

export function totalDias(periodos: Periodo[]): number {
  return periodos.filter(periodoValido).reduce((soma, p) => soma + diasCorridos(p), 0);
}

/** Mesmas regras e mensagens de `_salvar_ferias` no banco. */
export function validarMarcacao(periodos: Periodo[], recesso: Recesso | null, datas: DatasRecesso): string[] {
  const erros: string[] = [];

  periodos.forEach((p, i) => {
    const n = i + 1;
    if (!ehDataValida(p.inicio) || !ehDataValida(p.fim)) erros.push(`Período ${n}: data inválida.`);
    else if (p.fim < p.inicio) erros.push(`Período ${n}: o fim é anterior ao início.`);
    else if (p.inicio < INICIO_ANO || p.fim > FIM_ANO) erros.push(`Período ${n}: deve estar dentro de 2027.`);
  });

  const total = totalDias(periodos);
  if (total > MAX_DIAS) erros.push(`Soma ultrapassa 30 dias (${total}).`);

  for (let i = 0; i < periodos.length; i++) {
    for (let j = i + 1; j < periodos.length; j++) {
      const a = periodos[i];
      const b = periodos[j];
      if (periodoValido(a) && periodoValido(b) && sobrepoe(a, b)) erros.push(`Períodos ${i + 1} e ${j + 1} se sobrepõem.`);
    }
  }

  if (recesso) {
    periodos.forEach((p, i) => {
      if (periodoValido(p) && sobrepoe(p, datas[recesso])) erros.push(`Período ${i + 1} sobrepõe o recesso escolhido.`);
    });
  }

  return erros;
}

export function statusProcurador(periodos: Periodo[], recesso: Recesso | null): Status {
  return recesso !== null && totalDias(periodos) === MAX_DIAS ? 'completo' : 'pendente';
}
