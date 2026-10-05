import { diasCorridos, formatarBR } from './datas';
import { periodosDe, procuradoresDoSetor, setoresOrdenados } from './ocupacao';
import { statusProcurador } from './regras';
import { ROTULO_RECESSO } from './rotulos';
import type { DadosPublicos } from './tipos';

function campo(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function gerarCsv(d: DadosPublicos): string {
  const linhas: string[][] = [['Setor', 'Nome', 'Início', 'Fim', 'Dias', 'Recesso', 'Status']];
  for (const s of setoresOrdenados(d)) {
    for (const p of procuradoresDoSetor(d, s.id)) {
      const periodos = periodosDe(d, p.id);
      const recesso = p.recesso ? ROTULO_RECESSO[p.recesso] : '';
      const status = statusProcurador(periodos, p.recesso);
      if (periodos.length === 0) linhas.push([s.nome, p.nome, '', '', '', recesso, status]);
      for (const x of periodos) {
        linhas.push([s.nome, p.nome, formatarBR(x.inicio), formatarBR(x.fim), String(diasCorridos(x)), recesso, status]);
      }
    }
  }
  return linhas.map(l => l.map(campo).join(';')).join('\r\n') + '\r\n';
}
