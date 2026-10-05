import { beforeEach, describe, expect, it } from 'vitest';
import { criarApi, type ClienteRpc } from '../../src/api/rpc';
import type { Periodo } from '../../src/lib/tipos';
import { publico, resetar, servico, type Ids } from './ambiente';

const api = criarApi(publico as unknown as ClienteRpc);
let ids: Ids;
beforeEach(async () => { ids = await resetar(); });

async function periodosDe(id: number): Promise<Periodo[]> {
  const d = await api.dadosPublicos();
  return d.periodos.filter(p => p.procurador_id === id).map(({ inicio, fim }) => ({ inicio, fim }));
}

describe('dados_publicos', () => {
  it('não expõe hashes nem tokens', async () => {
    const token = await api.definirPin(ids.ana, '1234');
    const dados = await api.dadosPublicos();
    const json = JSON.stringify(dados);
    expect(json).not.toContain('pin_hash');
    expect(json).not.toContain('admin_hash');
    expect(json).not.toContain('$2');
    expect(json).not.toContain(token);
    expect(dados.procuradores.find(p => p.id === ids.ana)?.tem_pin).toBe(true);
    expect(dados.recesso.natal).toEqual({ inicio: '2026-12-20', fim: '2026-12-26' });
  });

  it('funções internas não são executáveis por anon', async () => {
    const { error } = await publico.rpc('_novo_token', { p_procurador_id: ids.ana, p_admin: true });
    expect(error).not.toBeNull();
  });
});

describe('PIN', () => {
  it('cria PIN e entra com ele', async () => {
    const t1 = await api.definirPin(ids.ana, '1234');
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    await expect(api.entrar(ids.ana, '1234')).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejeita PIN fora do formato', async () => {
    await expect(api.definirPin(ids.ana, '12a4')).rejects.toThrow('O PIN deve ter de 4 a 6 dígitos.');
    await expect(api.definirPin(ids.ana, '123')).rejects.toThrow('O PIN deve ter de 4 a 6 dígitos.');
  });

  it('não permite redefinir PIN existente', async () => {
    await api.definirPin(ids.ana, '1234');
    await expect(api.definirPin(ids.ana, '9999')).rejects.toThrow('PIN já foi criado');
  });

  it('bloqueia após 5 erros', async () => {
    await api.definirPin(ids.ana, '1234');
    for (let i = 1; i <= 4; i++) {
      await expect(api.entrar(ids.ana, '0000')).rejects.toThrow(`${5 - i} tentativa(s) restante(s)`);
    }
    await expect(api.entrar(ids.ana, '0000')).rejects.toThrow('Bloqueado por 15 minutos');
    await expect(api.entrar(ids.ana, '1234')).rejects.toThrow('Bloqueado até');
  });

  it('procurador inativo não cria PIN nem entra', async () => {
    await expect(api.definirPin(ids.inativo, '1234')).rejects.toThrow('Procurador não encontrado.');
    await expect(api.entrar(ids.inativo, '1234')).rejects.toThrow('Procurador não encontrado.');
  });
});

describe('salvar_minhas_ferias', () => {
  let token: string;
  beforeEach(async () => { token = await api.definirPin(ids.ana, '1234'); });

  const TRINTA = [{ inicio: '2027-03-01', fim: '2027-03-15' }, { inicio: '2027-07-01', fim: '2027-07-15' }];

  it('salva 30 dias e o recesso', async () => {
    await api.salvarMinhasFerias(token, TRINTA, 'natal');
    expect(await periodosDe(ids.ana)).toEqual(TRINTA);
    const d = await api.dadosPublicos();
    expect(d.procuradores.find(p => p.id === ids.ana)?.recesso).toBe('natal');
  });

  it.each([
    [[{ inicio: '2027-03-01', fim: '2027-03-15' }, { inicio: '2027-07-01', fim: '2027-07-16' }], null, 'Soma ultrapassa 30 dias (31).'],
    [[{ inicio: '2026-12-28', fim: '2027-01-05' }], null, 'Período 1: deve estar dentro de 2027.'],
    [[{ inicio: '2027-03-10', fim: '2027-03-01' }], null, 'Período 1: o fim é anterior ao início.'],
    [[{ inicio: '2027-02-30', fim: '2027-03-01' }], null, 'Período 1: data inválida.'],
    [[{ inicio: '2027-03-01', fim: '2027-03-10' }, { inicio: '2027-03-10', fim: '2027-03-12' }], null, 'Períodos 1 e 2 se sobrepõem.'],
    [[{ inicio: '2027-01-02', fim: '2027-01-05' }], 'ano_novo', 'Período 1 sobrepõe o recesso escolhido.'],
  ] as const)('rejeita %j', async (periodos, recesso, mensagem) => {
    await expect(api.salvarMinhasFerias(token, [...periodos], recesso)).rejects.toThrow(mensagem);
  });

  it('falha não altera a marcação anterior', async () => {
    await api.salvarMinhasFerias(token, TRINTA, 'natal');
    await expect(api.salvarMinhasFerias(token, [{ inicio: '2027-01-01', fim: '2027-02-15' }], 'natal')).rejects.toThrow();
    expect(await periodosDe(ids.ana)).toEqual(TRINTA);
  });

  it('só altera o dono do token', async () => {
    await api.salvarMinhasFerias(token, TRINTA, 'natal');
    const tBruno = await api.definirPin(ids.bruno, '5555');
    await api.salvarMinhasFerias(tBruno, [{ inicio: '2027-05-03', fim: '2027-05-07' }], 'ano_novo');
    expect(await periodosDe(ids.ana)).toEqual(TRINTA);
    expect(await periodosDe(ids.bruno)).toEqual([{ inicio: '2027-05-03', fim: '2027-05-07' }]);
  });

  it('token inválido ou vencido gera sessão expirada', async () => {
    await expect(api.salvarMinhasFerias('nao-existe', [], null)).rejects.toMatchObject({ sessaoExpirada: true });
    const { error } = await servico.from('sessoes').update({ expira_em: '2000-01-01T00:00:00Z' }).eq('token', token);
    expect(error).toBeNull();
    await expect(api.salvarMinhasFerias(token, [], null)).rejects.toMatchObject({ sessaoExpirada: true });
  });

  it('salvamentos simultâneos não duplicam períodos', async () => {
    const a = [{ inicio: '2027-05-01', fim: '2027-05-10' }];
    const b = [{ inicio: '2027-08-02', fim: '2027-08-06' }, { inicio: '2027-09-06', fim: '2027-09-10' }];
    await Promise.all([api.salvarMinhasFerias(token, a, null), api.salvarMinhasFerias(token, b, null)]);
    expect([a, b]).toContainEqual(await periodosDe(ids.ana));
  });

  it('sair invalida o token', async () => {
    await api.sair(token);
    await expect(api.salvarMinhasFerias(token, [], null)).rejects.toMatchObject({ sessaoExpirada: true });
  });
});
