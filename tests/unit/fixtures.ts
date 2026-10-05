import type { DadosPublicos, DatasRecesso } from '../../src/lib/tipos';

export const RECESSO: DatasRecesso = {
  natal: { inicio: '2026-12-20', fim: '2026-12-26' },
  ano_novo: { inicio: '2026-12-27', fim: '2027-01-02' },
};

/** Setor 1 "Contencioso" (ordem 2): Ana, Bruno, Carla (inativa). Setor 2 "Consultivo" (ordem 1): Davi. */
export function dadosExemplo(): DadosPublicos {
  return {
    setores: [
      { id: 1, nome: 'Contencioso', ordem: 2 },
      { id: 2, nome: 'Consultivo', ordem: 1 },
    ],
    procuradores: [
      { id: 10, nome: 'Ana', setor_id: 1, recesso: 'natal', ativo: true, tem_pin: true },
      { id: 11, nome: 'Bruno', setor_id: 1, recesso: 'ano_novo', ativo: true, tem_pin: false },
      { id: 12, nome: 'Carla', setor_id: 1, recesso: null, ativo: false, tem_pin: false },
      { id: 13, nome: 'Davi', setor_id: 2, recesso: null, ativo: true, tem_pin: false },
    ],
    periodos: [
      { procurador_id: 10, inicio: '2027-03-01', fim: '2027-03-10' },
      { procurador_id: 11, inicio: '2027-03-05', fim: '2027-03-06' },
      { procurador_id: 12, inicio: '2027-03-01', fim: '2027-03-31' },
    ],
    dias_especiais: [{ data: '2027-01-01', tipo: 'feriado', descricao: 'Confraternização Universal' }],
    recesso: RECESSO,
  };
}
