import { describe, expect, it } from 'vitest';
import { diasBloqueados, diasDeBloqueio } from '../../src/lib/bloqueios';

describe('diasDeBloqueio', () => {
  it.each([
    [1, 0], [2, 1], [4, 1], [5, 2], [6, 2], [7, 3], [9, 3], [10, 4], [11, 4], [12, 5], [13, 5],
    [14, 6], [16, 6], [17, 7], [18, 7], [19, 8], [21, 8], [22, 9], [24, 9], [25, 10], [30, 10],
  ])('%i dia(s) de férias → %i de bloqueio', (ferias, bloqueio) => {
    expect(diasDeBloqueio(ferias)).toBe(bloqueio);
  });
});

describe('diasBloqueados', () => {
  const sem = { dias_especiais: [] };

  it('não bloqueia férias de 1 dia', () => {
    expect(diasBloqueados({ inicio: '2027-03-10', fim: '2027-03-10' }, sem)).toEqual([]);
  });

  it('pula fins de semana (início na segunda)', () => {
    // 2027-03-01 é segunda; 5 dias → 2 úteis: quinta 25/02 e sexta 26/02
    expect(diasBloqueados({ inicio: '2027-03-01', fim: '2027-03-05' }, sem)).toEqual(['2027-02-25', '2027-02-26']);
  });

  it('pula feriados e pontos facultativos', () => {
    const d = { dias_especiais: [
      { data: '2027-02-26', tipo: 'feriado' as const, descricao: 'x' },
      { data: '2027-02-25', tipo: 'facultativo' as const, descricao: 'y' },
    ] };
    expect(diasBloqueados({ inicio: '2027-03-01', fim: '2027-03-05' }, d)).toEqual(['2027-02-23', '2027-02-24']);
  });

  it('ignora período inválido', () => {
    expect(diasBloqueados({ inicio: '', fim: '' }, sem)).toEqual([]);
  });
});
