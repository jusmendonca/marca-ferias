import { describe, expect, it } from 'vitest';
import { statusProcurador, totalDias, validarMarcacao } from '../../src/lib/regras';
import type { DatasRecesso } from '../../src/lib/tipos';

const REC: DatasRecesso = {
  natal: { inicio: '2026-12-20', fim: '2026-12-26' },
  ano_novo: { inicio: '2026-12-27', fim: '2027-01-02' },
};
const QUINZE_A = { inicio: '2027-03-01', fim: '2027-03-15' };
const QUINZE_B = { inicio: '2027-07-01', fim: '2027-07-15' };

describe('validarMarcacao', () => {
  it('aceita marcação vazia', () => {
    expect(validarMarcacao([], null, REC)).toEqual([]);
  });

  it('aceita exatamente 30 dias', () => {
    expect(validarMarcacao([QUINZE_A, QUINZE_B], 'natal', REC)).toEqual([]);
  });

  it('rejeita soma acima de 30', () => {
    expect(validarMarcacao([QUINZE_A, { inicio: '2027-07-01', fim: '2027-07-16' }], null, REC))
      .toEqual(['Soma ultrapassa 30 dias (31).']);
  });

  it('rejeita período fora de 2027', () => {
    expect(validarMarcacao([{ inicio: '2026-12-28', fim: '2027-01-05' }], null, REC))
      .toEqual(['Período 1: deve estar dentro de 2027.']);
  });

  it('rejeita fim antes do início', () => {
    expect(validarMarcacao([{ inicio: '2027-03-10', fim: '2027-03-01' }], null, REC))
      .toEqual(['Período 1: o fim é anterior ao início.']);
  });

  it('rejeita data vazia ou inexistente', () => {
    expect(validarMarcacao([QUINZE_A, { inicio: '', fim: '' }], null, REC))
      .toEqual(['Período 2: data inválida.']);
    expect(validarMarcacao([{ inicio: '2027-02-30', fim: '2027-03-01' }], null, REC))
      .toEqual(['Período 1: data inválida.']);
  });

  it('rejeita períodos sobrepostos', () => {
    expect(validarMarcacao([
      { inicio: '2027-03-01', fim: '2027-03-10' },
      { inicio: '2027-03-10', fim: '2027-03-12' },
    ], null, REC)).toEqual(['Períodos 1 e 2 se sobrepõem.']);
  });

  it('rejeita sobreposição com o recesso escolhido, e só com ele', () => {
    const p = [{ inicio: '2027-01-01', fim: '2027-01-05' }];
    expect(validarMarcacao(p, 'ano_novo', REC)).toEqual(['Período 1 sobrepõe o recesso escolhido.']);
    expect(validarMarcacao(p, 'natal', REC)).toEqual([]);
  });
});

describe('totalDias e status', () => {
  it('ignora períodos inválidos na soma', () => {
    expect(totalDias([QUINZE_A, { inicio: '', fim: '' }, { inicio: '2027-05-10', fim: '2027-05-01' }])).toBe(15);
  });

  it('completo exige 30 dias e recesso', () => {
    expect(statusProcurador([QUINZE_A, QUINZE_B], 'natal')).toBe('completo');
    expect(statusProcurador([QUINZE_A, QUINZE_B], null)).toBe('pendente');
    expect(statusProcurador([QUINZE_A], 'natal')).toBe('pendente');
  });
});
