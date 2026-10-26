import { describe, expect, it } from 'vitest';
import { periodosCriticos, trechosDoSetor } from '../../src/lib/criticos';
import { dadosExemplo } from './fixtures';

const d = dadosExemplo();

describe('períodos críticos', () => {
  it('agrupa dias úteis consecutivos com os mesmos ausentes, sem quebrar em fins de semana', () => {
    // Ana: férias 01–10/03/2027 (seg–qua); bloqueio 23–26/02. Bruno: férias 05–06/03 (sex–sáb), bloqueio 04/03.
    const t = trechosDoSetor(d, 1).filter(x => x.inicio >= '2027-02-23' && x.fim <= '2027-03-12');
    expect(t.map(x => [x.inicio, x.fim, x.presentes, x.ausentes.map(a => a.procurador.nome + ':' + a.motivo)])).toEqual([
      ['2027-02-23', '2027-02-26', 1, ['Ana:bloqueio']],
      ['2027-03-01', '2027-03-03', 1, ['Ana:ferias']],
      ['2027-03-04', '2027-03-04', 0, ['Ana:ferias', 'Bruno:bloqueio']],
      ['2027-03-05', '2027-03-05', 0, ['Ana:ferias', 'Bruno:ferias']],
      ['2027-03-08', '2027-03-10', 1, ['Ana:ferias']],
    ]);
  });

  it('calcula percentual e filtra pelo limite', () => {
    const todos = periodosCriticos(d, 1, 100);
    expect(todos.every(x => x.pct === 50 || x.pct === 0)).toBe(true);
    const criticos = periodosCriticos(d, 1, 25);
    expect(criticos.map(x => [x.inicio, x.fim, x.pct])).toEqual([
      ['2027-03-04', '2027-03-04', 0],
      ['2027-03-05', '2027-03-05', 0],
    ]);
  });
});
