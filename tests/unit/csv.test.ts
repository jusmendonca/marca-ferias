import { describe, expect, it } from 'vitest';
import { gerarCsv } from '../../src/lib/csv';
import { dadosExemplo } from './fixtures';

describe('gerarCsv', () => {
  it('gera uma linha por período, ordenado por setor e nome', () => {
    expect(gerarCsv(dadosExemplo())).toBe([
      'Setor;Nome;Início;Fim;Dias;Recesso;Status',
      'Consultivo;Davi;;;;;pendente',
      'Contencioso;Ana;01/03/2027;10/03/2027;10;Natal;pendente',
      'Contencioso;Bruno;05/03/2027;06/03/2027;2;Ano-Novo;pendente',
      '',
    ].join('\r\n'));
  });

  it('escapa ponto e vírgula e aspas, preservando acentos', () => {
    const d = dadosExemplo();
    d.setores[1].nome = 'Jurídico; "Especial"';
    const linhas = gerarCsv(d).split('\r\n');
    expect(linhas[1]).toBe('"Jurídico; ""Especial""";Davi;;;;;pendente');
  });
});
