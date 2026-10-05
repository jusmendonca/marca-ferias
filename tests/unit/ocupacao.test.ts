import { describe, expect, it } from 'vitest';
import {
  ausenciasNoDia, colegasFora, periodosDe, procuradoresDoSetor, setoresOrdenados,
} from '../../src/lib/ocupacao';
import { dadosExemplo } from './fixtures';

const d = dadosExemplo();

describe('ocupação', () => {
  it('ordena setores por ordem', () => {
    expect(setoresOrdenados(d).map(s => s.nome)).toEqual(['Consultivo', 'Contencioso']);
  });

  it('lista só procuradores ativos do setor, por nome', () => {
    expect(procuradoresDoSetor(d, 1).map(p => p.nome)).toEqual(['Ana', 'Bruno']);
  });

  it('retorna períodos de um procurador', () => {
    expect(periodosDe(d, 10)).toEqual([{ procurador_id: 10, inicio: '2027-03-01', fim: '2027-03-10' }]);
  });

  it('conta ausentes por férias e ignora inativos', () => {
    const o = ausenciasNoDia(d, 1, '2027-03-05');
    expect(o.total).toBe(2);
    expect(o.presentes).toBe(0);
    expect(o.ausentes.map(a => [a.procurador.nome, a.motivo])).toEqual([['Ana', 'ferias'], ['Bruno', 'ferias']]);
  });

  it('todos presentes fora das férias', () => {
    expect(ausenciasNoDia(d, 1, '2027-03-11').presentes).toBe(2);
  });

  it('conta recesso escolhido como ausência', () => {
    expect(ausenciasNoDia(d, 1, '2026-12-22').ausentes.map(a => [a.procurador.nome, a.motivo])).toEqual([['Ana', 'recesso']]);
    expect(ausenciasNoDia(d, 1, '2027-01-01').ausentes.map(a => a.procurador.nome)).toEqual(['Bruno']);
  });

  it('lista colegas fora no período, exceto a própria pessoa e inativos', () => {
    expect(colegasFora(d, 1, { inicio: '2027-03-04', fim: '2027-03-05' }, 10)).toEqual([
      { nome: 'Bruno', inicio: '2027-03-05', fim: '2027-03-06', motivo: 'ferias' },
    ]);
    expect(colegasFora(d, 1, { inicio: '2026-12-21', fim: '2026-12-21' }, 11)).toEqual([
      { nome: 'Ana', inicio: '2026-12-20', fim: '2026-12-26', motivo: 'recesso' },
    ]);
  });
});
