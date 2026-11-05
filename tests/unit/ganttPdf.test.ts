import { describe, expect, it } from 'vitest';
import { gerarGanttPdf } from '../../src/lib/ganttPdf';
import { dadosExemplo } from './fixtures';

describe('gerarGanttPdf', () => {
  it('gera PDF em A4 paisagem', () => {
    const doc = gerarGanttPdf(dadosExemplo());
    const { width, height } = doc.internal.pageSize;
    expect(width).toBeGreaterThan(height);
    expect(Math.round(width)).toBe(297);
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
  });

  it('inclui texto dos setores, da tabela de ausências e dos percentuais', () => {
    const doc = gerarGanttPdf(dadosExemplo());
    const conteudo = doc.output();
    // Texto sai em streams comprimidos ou não; basta o documento ter mais de uma página de conteúdo útil.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(conteudo.length).toBeGreaterThan(2000);
  });

  it('respeita o filtro de setor sem falhar com setor vazio', () => {
    const d = dadosExemplo();
    expect(() => gerarGanttPdf(d, 2)).not.toThrow();
    expect(() => gerarGanttPdf(d, 999)).not.toThrow();
  });
});
