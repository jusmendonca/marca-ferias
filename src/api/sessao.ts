export type TipoSessao = 'proc' | 'admin';

export interface Sessao {
  token: string;
  procuradorId: number | null;
  expiraEm: number;
}

export const VALIDADE_MS = 4 * 60 * 60 * 1000;

const chave = (t: TipoSessao) => `marca-ferias:sessao:${t}`;

export function lerSessao(t: TipoSessao, agora = Date.now()): Sessao | null {
  try {
    const bruto = localStorage.getItem(chave(t));
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Sessao;
    if (typeof s.token !== 'string' || typeof s.expiraEm !== 'number' || s.expiraEm <= agora) {
      localStorage.removeItem(chave(t));
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function gravarSessao(t: TipoSessao, token: string, procuradorId: number | null, agora = Date.now()): void {
  try {
    const s: Sessao = { token, procuradorId, expiraEm: agora + VALIDADE_MS };
    localStorage.setItem(chave(t), JSON.stringify(s));
  } catch {
    // Sem storage (modo privado): a sessão vale só enquanto a página estiver aberta.
  }
}

export function limparSessao(t: TipoSessao): void {
  try {
    localStorage.removeItem(chave(t));
  } catch {
    // ignorado
  }
}
