import { describe, expect, it } from 'vitest';
import {
  contem, deNumero, diaDaSemana, diasCorridos, ehDataValida, formatarBR, paraNumero, sobrepoe, somarDias,
} from '../../src/lib/datas';

describe('datas', () => {
  it('roda no fuso de São Paulo', () => {
    expect(process.env.TZ).toBe('America/Sao_Paulo');
  });

  it('valida datas', () => {
    expect(ehDataValida('2027-01-31')).toBe(true);
    expect(ehDataValida('2027-02-29')).toBe(false);
    expect(ehDataValida('2028-02-29')).toBe(true);
    expect(ehDataValida('2027-13-01')).toBe(false);
    expect(ehDataValida('')).toBe(false);
    expect(ehDataValida('01/02/2027')).toBe(false);
  });

  it('converte ida e volta sem perder dia', () => {
    for (const d of ['2026-12-21', '2027-01-01', '2027-03-14', '2027-10-31', '2027-12-31']) {
      expect(deNumero(paraNumero(d))).toBe(d);
    }
  });

  it('soma dias atravessando o ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('conta dias corridos inclusive', () => {
    expect(diasCorridos({ inicio: '2027-01-01', fim: '2027-01-01' })).toBe(1);
    expect(diasCorridos({ inicio: '2027-02-20', fim: '2027-03-01' })).toBe(10);
    expect(diasCorridos({ inicio: '2027-01-01', fim: '2027-12-31' })).toBe(365);
  });

  it('detecta sobreposição nas bordas', () => {
    const a = { inicio: '2027-01-01', fim: '2027-01-10' };
    expect(sobrepoe(a, { inicio: '2027-01-10', fim: '2027-01-15' })).toBe(true);
    expect(sobrepoe(a, { inicio: '2027-01-11', fim: '2027-01-15' })).toBe(false);
    expect(sobrepoe({ inicio: '2027-01-05', fim: '2027-01-06' }, a)).toBe(true);
  });

  it('verifica se um dia está contido', () => {
    const p = { inicio: '2027-01-01', fim: '2027-01-10' };
    expect(contem(p, '2027-01-10')).toBe(true);
    expect(contem(p, '2027-01-11')).toBe(false);
  });

  it('calcula o dia da semana em UTC', () => {
    expect(diaDaSemana('2027-01-01')).toBe(5); // sexta
    expect(diaDaSemana('2027-01-03')).toBe(0); // domingo
  });

  it('formata no padrão brasileiro', () => {
    expect(formatarBR('2027-03-05')).toBe('05/03/2027');
  });
});
