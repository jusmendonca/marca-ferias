import { describe, expect, it } from 'vitest';
import { gerarGanttImpressao } from '../../src/lib/ganttImpressao';
import { dadosExemplo } from './fixtures';

describe('gerarGanttImpressao', () => {
  it('inclui setores, procuradores ativos, férias, bloqueio e recesso', () => {
    const html = gerarGanttImpressao(dadosExemplo());
    expect(html).toContain('Contencioso (2)');
    expect(html).toContain('Ana');
    expect(html).not.toContain('Carla');
    expect(html).toContain('class="ferias"');
    expect(html).toContain('class="bloqueio"');
    expect(html).toContain('class="recesso"');
    expect(html).toContain('01/03–10/03');
    expect(html).toContain('Presentes no setor');
    expect(html).toContain('rgba(220,38,38,0.45)');
    expect(html).toContain('>50%</i>');
    expect(html).toContain('Períodos de ausência — Contencioso');
    // Ana e Bruno de férias juntos (04–05/03 dias úteis): 0 de 2 presentes, linha crítica
    expect(html).toMatch(/<tr class="critico"><td>04\/03\/2027<\/td><td class="n">1<\/td><td class="n"><b>0%<\/b><\/td><td class="n">0 de 2<\/td><td class="n">2<\/td>/);
    expect(html).toContain('>100%</i>');
  });

  it('filtra por setor e escapa HTML nos nomes', () => {
    const d = dadosExemplo();
    d.procuradores.push({ id: 99, nome: '<b>X</b>', setor_id: 2, recesso: null, ativo: true, tem_pin: false });
    const html = gerarGanttImpressao(d, 2);
    expect(html).not.toContain('Contencioso');
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});
