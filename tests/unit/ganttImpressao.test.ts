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
  });

  it('filtra por setor e escapa HTML nos nomes', () => {
    const d = dadosExemplo();
    d.procuradores.push({ id: 99, nome: '<b>X</b>', setor_id: 2, recesso: null, ativo: true, tem_pin: false });
    const html = gerarGanttImpressao(d, 2);
    expect(html).not.toContain('Contencioso');
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
  });
});
