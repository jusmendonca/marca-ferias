// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderGantt } from '../../src/ui/gantt';
import { dadosExemplo } from './fixtures';

function montar(setorId: number | null = 1) {
  const aoClicar = vi.fn();
  const el = renderGantt(dadosExemplo(), { zoom: 'trimestre', setorId, aoClicarProcurador: aoClicar });
  return { el, aoClicar };
}

describe('renderGantt', () => {
  it('mostra só o setor filtrado e só ativos', () => {
    const { el } = montar(1);
    expect(el.querySelectorAll('.setor-titulo')).toHaveLength(1);
    const nomes = [...el.querySelectorAll('.rotulo-proc')].map(n => n.firstChild?.textContent);
    expect(nomes).toEqual(['Ana', 'Bruno']);
  });

  it('mostra todos os setores sem filtro, na ordem configurada', () => {
    const { el } = montar(null);
    const titulos = [...el.querySelectorAll('.setor-titulo .rotulo')].map(n => n.textContent);
    expect(titulos).toEqual(['Consultivo (1)', 'Contencioso (2)']);
  });

  it('posiciona barras de férias e de recesso', () => {
    const { el } = montar();
    const ferias = el.querySelectorAll<HTMLElement>('.barra.ferias');
    expect(ferias).toHaveLength(2);
    expect(ferias[0].style.left).toBe('700px');
    expect(ferias[0].style.width).toBe('100px');
    const recesso = el.querySelectorAll<HTMLElement>('.barra.recesso');
    expect([...recesso].map(r => [r.style.left, r.style.width])).toEqual([['0px', '60px'], ['60px', '70px']]);
  });

  it('desenha uma célula de ocupação por dia com o resumo no título', () => {
    const { el } = montar();
    const celulas = el.querySelectorAll<HTMLElement>('.ocupacao .celula');
    expect(celulas).toHaveLength(376);
    expect(celulas[74].title).toContain('05/03/2027: 0/2 presentes');
    expect(celulas[74].title).toContain('Ana, Bruno');
  });

  it('sombreia feriados', () => {
    const { el } = montar();
    expect(el.querySelectorAll('.faixa.feriado')).toHaveLength(1);
  });

  it('avisa o clique na barra', () => {
    const { el, aoClicar } = montar();
    el.querySelector<HTMLButtonElement>('.barra.ferias')!.click();
    expect(aoClicar).toHaveBeenCalledWith(10);
  });
});
