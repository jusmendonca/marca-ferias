import type { DadosPublicos, DatasRecesso, DiaEspecial, Periodo, Recesso } from '../lib/tipos';

export const MSG_CONEXAO = 'Não foi possível conectar; tente novamente em instantes.';

export class ErroApi extends Error {
  constructor(mensagem: string, readonly sessaoExpirada = false) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export function mensagemDe(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro inesperado.';
}

export interface RespostaRpc {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** Subconjunto do SupabaseClient usado pelo app (facilita testes com cliente falso). */
export interface ClienteRpc {
  rpc(nome: string, args?: Record<string, unknown>): PromiseLike<RespostaRpc>;
}

interface RespostaLogin {
  ok: boolean;
  token?: string;
  erro?: string;
}

const soDatas = (periodos: Periodo[]) => periodos.map(({ inicio, fim }) => ({ inicio, fim }));

export function criarApi(cliente: ClienteRpc) {
  async function chamar<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
    let resposta: RespostaRpc;
    try {
      resposta = await cliente.rpc(nome, args);
    } catch {
      throw new ErroApi(MSG_CONEXAO);
    }
    const { data, error } = resposta;
    if (error) {
      // Erros do Postgres sempre têm código; sem código = falha de rede/fetch.
      if (!error.code) throw new ErroApi(MSG_CONEXAO);
      throw new ErroApi(error.message, error.message.startsWith('Sessão expirada'));
    }
    return data as T;
  }

  async function login(nome: string, args: Record<string, unknown>): Promise<string> {
    const r = await chamar<RespostaLogin>(nome, args);
    if (!r.ok || !r.token) throw new ErroApi(r.erro ?? 'Falha ao entrar.');
    return r.token;
  }

  return {
    ping: () => chamar<string>('ping'),
    dadosPublicos: () => chamar<DadosPublicos>('dados_publicos'),
    definirPin: (procuradorId: number, pin: string) =>
      login('definir_pin', { p_procurador_id: procuradorId, p_pin: pin }),
    entrar: (procuradorId: number, pin: string) =>
      login('entrar', { p_procurador_id: procuradorId, p_pin: pin }),
    salvarMinhasFerias: (token: string, periodos: Periodo[], recesso: Recesso | null) =>
      chamar<null>('salvar_minhas_ferias', { p_token: token, p_periodos: soDatas(periodos), p_recesso: recesso }),
    sair: (token: string) => chamar<null>('sair', { p_token: token }),

    adminEntrar: (senha: string) => login('admin_entrar', { p_senha: senha }),
    adminSalvarSetor: (token: string, id: number | null, nome: string, ordem: number) =>
      chamar<number>('admin_salvar_setor', { p_token: token, p_id: id, p_nome: nome, p_ordem: ordem }),
    adminExcluirSetor: (token: string, id: number) =>
      chamar<null>('admin_excluir_setor', { p_token: token, p_id: id }),
    adminSalvarProcurador: (token: string, id: number | null, nome: string, setorId: number | null, ativo: boolean) =>
      chamar<number>('admin_salvar_procurador', { p_token: token, p_id: id, p_nome: nome, p_setor_id: setorId, p_ativo: ativo }),
    adminExcluirProcurador: (token: string, id: number) =>
      chamar<null>('admin_excluir_procurador', { p_token: token, p_id: id }),
    adminResetarPin: (token: string, procuradorId: number) =>
      chamar<null>('admin_resetar_pin', { p_token: token, p_procurador_id: procuradorId }),
    adminSalvarDiaEspecial: (token: string, dia: DiaEspecial) =>
      chamar<null>('admin_salvar_dia_especial', { p_token: token, p_data: dia.data, p_tipo: dia.tipo, p_descricao: dia.descricao }),
    adminExcluirDiaEspecial: (token: string, data: string) =>
      chamar<null>('admin_excluir_dia_especial', { p_token: token, p_data: data }),
    adminSalvarRecesso: (token: string, datas: DatasRecesso) =>
      chamar<null>('admin_salvar_recesso', {
        p_token: token,
        p_natal_inicio: datas.natal.inicio, p_natal_fim: datas.natal.fim,
        p_ano_novo_inicio: datas.ano_novo.inicio, p_ano_novo_fim: datas.ano_novo.fim,
      }),
    adminSalvarFerias: (token: string, procuradorId: number, periodos: Periodo[], recesso: Recesso | null) =>
      chamar<null>('admin_salvar_ferias', { p_token: token, p_procurador_id: procuradorId, p_periodos: soDatas(periodos), p_recesso: recesso }),
    adminTrocarSenha: (token: string, atual: string, nova: string) =>
      chamar<null>('admin_trocar_senha', { p_token: token, p_senha_atual: atual, p_nova: nova }),
  };
}

export type Api = ReturnType<typeof criarApi>;
