/** Data no formato 'YYYY-MM-DD'. */
export type DataISO = string;

export type Recesso = 'natal' | 'ano_novo';

export interface Periodo {
  inicio: DataISO;
  fim: DataISO;
}

export interface Setor {
  id: number;
  nome: string;
  ordem: number;
}

export interface Procurador {
  id: number;
  nome: string;
  setor_id: number;
  recesso: Recesso | null;
  ativo: boolean;
  tem_pin: boolean;
}

export interface PeriodoFerias extends Periodo {
  procurador_id: number;
}

export interface DiaEspecial {
  data: DataISO;
  tipo: 'feriado' | 'facultativo';
  descricao: string;
}

export type DatasRecesso = Record<Recesso, Periodo>;

export interface DadosPublicos {
  setores: Setor[];
  procuradores: Procurador[];
  periodos: PeriodoFerias[];
  dias_especiais: DiaEspecial[];
  recesso: DatasRecesso;
}
