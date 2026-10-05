import { beforeEach, describe, expect, it } from 'vitest';
import { publico, resetar } from './ambiente';

beforeEach(async () => { await resetar(); });

describe('acesso público ao banco', () => {
  it('ping responde', async () => {
    const { data, error } = await publico.rpc('ping');
    expect(error).toBeNull();
    expect(data).toBe('pong');
  });

  it('anon não lê tabelas diretamente', async () => {
    for (const tabela of ['setores', 'procuradores', 'periodos_ferias', 'dias_especiais', 'config', 'sessoes']) {
      const { data, error } = await publico.from(tabela).select('*');
      expect(error !== null || (data ?? []).length === 0, tabela).toBe(true);
    }
  });

  it('anon não escreve tabelas diretamente', async () => {
    const { error } = await publico.from('setores').insert({ nome: 'Invasor', ordem: 9 });
    expect(error).not.toBeNull();
  });

  it('anon não executa a função de teste', async () => {
    const { error } = await publico.rpc('_teste_definir_admin', { p_senha: 'x' });
    expect(error).not.toBeNull();
  });
});
