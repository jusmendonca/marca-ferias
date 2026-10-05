// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { gravarSessao, lerSessao, limparSessao, VALIDADE_MS } from '../../src/api/sessao';

beforeEach(() => localStorage.clear());

describe('sessão local', () => {
  it('grava e lê dentro da validade', () => {
    gravarSessao('proc', 'tok', 7, 1000);
    expect(lerSessao('proc', 2000)).toEqual({ token: 'tok', procuradorId: 7, expiraEm: 1000 + VALIDADE_MS });
  });

  it('sessão vencida retorna null e é removida', () => {
    gravarSessao('proc', 'tok', 7, 0);
    expect(lerSessao('proc', VALIDADE_MS + 1)).toBeNull();
    expect(localStorage.getItem('marca-ferias:sessao:proc')).toBeNull();
  });

  it('conteúdo corrompido retorna null', () => {
    localStorage.setItem('marca-ferias:sessao:proc', '{nao json');
    expect(lerSessao('proc')).toBeNull();
  });

  it('sessões de Procurador e admin são independentes', () => {
    gravarSessao('proc', 'p', 1);
    gravarSessao('admin', 'a', null);
    limparSessao('proc');
    expect(lerSessao('proc')).toBeNull();
    expect(lerSessao('admin')?.token).toBe('a');
  });
});
