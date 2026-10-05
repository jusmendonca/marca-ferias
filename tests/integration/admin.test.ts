import { beforeEach, describe, expect, it } from 'vitest';
import { criarApi, type ClienteRpc } from '../../src/api/rpc';
import { publico, resetar, SENHA_ADMIN, servico, type Ids } from './ambiente';

const api = criarApi(publico as unknown as ClienteRpc);
let ids: Ids;
let t: string;

beforeEach(async () => {
  ids = await resetar();
  t = await api.adminEntrar(SENHA_ADMIN);
});

describe('admin', () => {
  it('rejeita senha errada', async () => {
    await expect(api.adminEntrar('errada')).rejects.toThrow('Senha incorreta.');
  });

  it('bloqueia o login do admin após 5 senhas erradas, inclusive para a senha certa', async () => {
    for (let i = 1; i <= 4; i++) await expect(api.adminEntrar('errada')).rejects.toThrow('Senha incorreta.');
    await expect(api.adminEntrar('errada')).rejects.toThrow('Bloqueado por 15 minutos');
    await expect(api.adminEntrar(SENHA_ADMIN)).rejects.toThrow('Bloqueado até');
    const { error } = await servico.from('config').update({ admin_bloqueado_ate: '2000-01-01T00:00:00Z' }).eq('id', true);
    expect(error).toBeNull();
    await expect(api.adminEntrar(SENHA_ADMIN)).resolves.toMatch(/^[0-9a-f]{64}$/);
    // acerto zera o contador: 4 erros seguidos ainda não bloqueiam
    for (let i = 1; i <= 4; i++) await expect(api.adminEntrar('errada')).rejects.toThrow('Senha incorreta.');
  });

  it('exige token de admin (token de Procurador não serve)', async () => {
    const tAna = await api.definirPin(ids.ana, '1234');
    await expect(api.adminSalvarSetor(tAna, null, 'X', 1)).rejects.toMatchObject({ sessaoExpirada: true });
  });

  it('CRUD de setores', async () => {
    const id = await api.adminSalvarSetor(t, null, 'Novo Setor', 3);
    await api.adminSalvarSetor(t, id, 'Setor Renomeado', 4);
    let d = await api.dadosPublicos();
    expect(d.setores.find(s => s.id === id)).toEqual({ id, nome: 'Setor Renomeado', ordem: 4 });
    await expect(api.adminSalvarSetor(t, null, 'Setor A', 1)).rejects.toThrow('Já existe um setor com esse nome.');
    await expect(api.adminSalvarSetor(t, null, '   ', 1)).rejects.toThrow('Informe o nome do setor.');
    await expect(api.adminExcluirSetor(t, ids.setorA)).rejects.toThrow('Setor possui Procuradores');
    await api.adminExcluirSetor(t, id);
    d = await api.dadosPublicos();
    expect(d.setores.some(s => s.id === id)).toBe(false);
  });

  it('CRUD de Procuradores', async () => {
    const id = await api.adminSalvarProcurador(t, null, 'Carla', ids.setorB, true);
    await api.adminSalvarProcurador(t, id, 'Carla Souza', ids.setorA, true);
    let d = await api.dadosPublicos();
    expect(d.procuradores.find(p => p.id === id)).toMatchObject({ nome: 'Carla Souza', setor_id: ids.setorA, ativo: true });
    await expect(api.adminSalvarProcurador(t, null, 'Ana', ids.setorA, true)).rejects.toThrow('Já existe um Procurador com esse nome.');
    await expect(api.adminSalvarProcurador(t, null, 'Sem Setor', null, true)).rejects.toThrow('Setor inválido.');
    await api.adminExcluirProcurador(t, id);
    d = await api.dadosPublicos();
    expect(d.procuradores.some(p => p.id === id)).toBe(false);
  });

  it('inativar derruba a sessão e impede novo login', async () => {
    const tAna = await api.definirPin(ids.ana, '1234');
    await api.adminSalvarProcurador(t, ids.ana, 'Ana', ids.setorA, false);
    await expect(api.salvarMinhasFerias(tAna, [], null)).rejects.toMatchObject({ sessaoExpirada: true });
    await expect(api.entrar(ids.ana, '1234')).rejects.toThrow('Procurador não encontrado.');
  });

  it('reseta PIN', async () => {
    const tAna = await api.definirPin(ids.ana, '1234');
    await api.adminResetarPin(t, ids.ana);
    const d = await api.dadosPublicos();
    expect(d.procuradores.find(p => p.id === ids.ana)?.tem_pin).toBe(false);
    await expect(api.salvarMinhasFerias(tAna, [], null)).rejects.toMatchObject({ sessaoExpirada: true });
    await expect(api.definirPin(ids.ana, '9999')).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('dias especiais: inclui, altera e remove', async () => {
    await api.adminSalvarDiaEspecial(t, { data: '2027-02-08', tipo: 'facultativo', descricao: 'Carnaval' });
    await api.adminSalvarDiaEspecial(t, { data: '2027-02-08', tipo: 'facultativo', descricao: 'Carnaval (segunda)' });
    let d = await api.dadosPublicos();
    expect(d.dias_especiais).toContainEqual({ data: '2027-02-08', tipo: 'facultativo', descricao: 'Carnaval (segunda)' });
    await expect(api.adminSalvarDiaEspecial(t, { data: '2027-02-09', tipo: 'outro' as never, descricao: 'x' })).rejects.toThrow('Tipo inválido.');
    await api.adminExcluirDiaEspecial(t, '2027-02-08');
    d = await api.dadosPublicos();
    expect(d.dias_especiais.some(x => x.data === '2027-02-08')).toBe(false);
  });

  it('alterar recesso não apaga marcações em conflito', async () => {
    const tAna = await api.definirPin(ids.ana, '1234');
    await api.salvarMinhasFerias(tAna, [{ inicio: '2027-01-03', fim: '2027-01-05' }], 'ano_novo');
    await api.adminSalvarRecesso(t, {
      natal: { inicio: '2026-12-20', fim: '2026-12-26' },
      ano_novo: { inicio: '2026-12-28', fim: '2027-01-04' },
    });
    const d = await api.dadosPublicos();
    expect(d.recesso.ano_novo).toEqual({ inicio: '2026-12-28', fim: '2027-01-04' });
    expect(d.periodos.filter(p => p.procurador_id === ids.ana)).toHaveLength(1);
    await expect(api.adminSalvarRecesso(t, {
      natal: { inicio: '2026-12-26', fim: '2026-12-20' },
      ano_novo: { inicio: '2026-12-28', fim: '2027-01-04' },
    })).rejects.toThrow('Datas de recesso inválidas.');
  });

  it('salva férias de terceiros com as mesmas regras', async () => {
    await expect(api.adminSalvarFerias(t, ids.bruno, [{ inicio: '2027-01-04', fim: '2027-02-03' }], null))
      .rejects.toThrow('Soma ultrapassa 30 dias (31).');
    await api.adminSalvarFerias(t, ids.bruno, [{ inicio: '2027-01-04', fim: '2027-02-02' }], 'natal');
    const d = await api.dadosPublicos();
    expect(d.periodos.filter(p => p.procurador_id === ids.bruno)).toHaveLength(1);
  });

  it('troca a senha', async () => {
    await expect(api.adminTrocarSenha(t, 'errada', 'nova-senha-123')).rejects.toThrow('Senha atual incorreta.');
    await expect(api.adminTrocarSenha(t, SENHA_ADMIN, 'curta')).rejects.toThrow('A nova senha deve ter ao menos 8 caracteres.');
    await api.adminTrocarSenha(t, SENHA_ADMIN, 'nova-senha-123');
    await expect(api.adminEntrar('nova-senha-123')).resolves.toMatch(/^[0-9a-f]{64}$/);
    await expect(api.adminEntrar(SENHA_ADMIN)).rejects.toThrow('Senha incorreta.');
  });
});
