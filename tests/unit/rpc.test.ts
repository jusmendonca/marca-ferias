import { describe, expect, it } from 'vitest';
import { criarApi, MSG_CONEXAO, type ClienteRpc, type RespostaRpc } from '../../src/api/rpc';

function falso(resposta: RespostaRpc) {
  const chamadas: [string, Record<string, unknown> | undefined][] = [];
  const cliente: ClienteRpc = {
    rpc: async (nome, args) => { chamadas.push([nome, args]); return resposta; },
  };
  return { api: criarApi(cliente), chamadas };
}

describe('cliente RPC', () => {
  it('erro sem código vira mensagem de conexão', async () => {
    const { api } = falso({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    await expect(api.dadosPublicos()).rejects.toThrow(MSG_CONEXAO);
  });

  it('exceção do cliente vira mensagem de conexão', async () => {
    const api = criarApi({ rpc: async () => { throw new Error('rede caiu'); } });
    await expect(api.ping()).rejects.toThrow(MSG_CONEXAO);
  });

  it('marca sessão expirada', async () => {
    const { api } = falso({ data: null, error: { message: 'Sessão expirada. Entre novamente.', code: 'P0001' } });
    await expect(api.salvarMinhasFerias('t', [], null)).rejects.toMatchObject({ sessaoExpirada: true });
  });

  it('repassa mensagem de regra do servidor', async () => {
    const { api } = falso({ data: null, error: { message: 'Soma ultrapassa 30 dias (31).', code: 'P0001' } });
    await expect(api.salvarMinhasFerias('t', [], null)).rejects.toMatchObject({
      message: 'Soma ultrapassa 30 dias (31).', sessaoExpirada: false,
    });
  });

  it('login com ok=false lança a mensagem do servidor', async () => {
    const { api } = falso({ data: { ok: false, erro: 'PIN incorreto — 4 tentativa(s) restante(s).' }, error: null });
    await expect(api.entrar(1, '0000')).rejects.toThrow('PIN incorreto — 4 tentativa(s) restante(s).');
  });

  it('login com ok=true devolve o token', async () => {
    const { api } = falso({ data: { ok: true, token: 'abc' }, error: null });
    await expect(api.definirPin(1, '1234')).resolves.toBe('abc');
  });

  it('envia apenas início e fim dos períodos', async () => {
    const { api, chamadas } = falso({ data: null, error: null });
    await api.salvarMinhasFerias('t', [{ inicio: '2027-01-04', fim: '2027-01-08', procurador_id: 9 } as never], 'natal');
    expect(chamadas[0]).toEqual(['salvar_minhas_ferias', {
      p_token: 't', p_periodos: [{ inicio: '2027-01-04', fim: '2027-01-08' }], p_recesso: 'natal',
    }]);
  });
});
