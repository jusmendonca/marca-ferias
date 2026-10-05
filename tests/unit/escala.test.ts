import { describe, expect, it } from 'vitest';
import { geometria, indiceDia, meses, totalDiasGantt } from '../../src/lib/escala';

describe('escala do Gantt', () => {
  it('cobre 21/12/2026 a 31/12/2027', () => {
    expect(totalDiasGantt()).toBe(376);
    expect(indiceDia('2026-12-21')).toBe(0);
    expect(indiceDia('2027-01-01')).toBe(11);
    expect(indiceDia('2027-03-01')).toBe(70);
  });

  it('posiciona barras conforme o zoom', () => {
    expect(geometria({ inicio: '2027-01-01', fim: '2027-01-10' }, 'trimestre')).toEqual({ left: 110, width: 100 });
    expect(geometria({ inicio: '2027-01-01', fim: '2027-01-01' }, 'mes')).toEqual({ left: 352, width: 32 });
  });

  it('recorta períodos que começam antes do intervalo', () => {
    expect(geometria({ inicio: '2026-12-20', fim: '2026-12-26' }, 'trimestre')).toEqual({ left: 0, width: 60 });
  });

  it('retorna null para períodos fora do intervalo', () => {
    expect(geometria({ inicio: '2026-12-01', fim: '2026-12-10' }, 'ano')).toBeNull();
  });

  it('segmenta os meses', () => {
    const m = meses();
    expect(m).toHaveLength(13);
    expect(m[0]).toEqual({ rotulo: 'Dez/26', inicio: 0, dias: 11 });
    expect(m[1]).toEqual({ rotulo: 'Jan/27', inicio: 11, dias: 31 });
    expect(m[2]).toEqual({ rotulo: 'Fev/27', inicio: 42, dias: 28 });
    expect(m.reduce((s, x) => s + x.dias, 0)).toBe(376);
  });
});
