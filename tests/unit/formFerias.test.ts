// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { formularioFerias, type EstadoFerias } from '../../src/ui/formFerias';
import { dadosExemplo } from './fixtures';

function montar(estado: EstadoFerias) {
  const redesenhar = vi.fn();
  const salvar = vi.fn();
  const dados = dadosExemplo();
  const procurador = dados.procuradores.find(p => p.id === 10)!;
  const form = formularioFerias({ dados, procurador, estado, redesenhar, salvar });
  document.body.replaceChildren(form);
  return { form, redesenhar, salvar };
}

function digitar(input: HTMLInputElement, valor: string) {
  input.value = valor;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const botaoSalvar = (form: HTMLElement) =>
  [...form.querySelectorAll('button')].find(b => b.textContent === 'Salvar') as HTMLButtonElement;

describe('formularioFerias', () => {
  it('alterar uma data atualiza o resumo sem recriar o campo nem a tela', () => {
    const estado: EstadoFerias = { periodos: [{ inicio: '2027-05-03', fim: '2027-05-07' }], recesso: null };
    const { form, redesenhar } = montar(estado);
    const [inicio, fim] = form.querySelectorAll<HTMLInputElement>('input[type=date]');

    digitar(fim, '2027-05-10');

    expect(redesenhar).not.toHaveBeenCalled();
    expect(form.contains(fim) && form.contains(inicio)).toBe(true);
    expect(form.querySelector('.dias')!.textContent).toBe('8 dia(s)');
    expect(form.querySelector('.contador')!.textContent).toContain('8 / 30 dias');
    expect(estado.periodos[0].fim).toBe('2027-05-10');
  });

  it('data inicial posterior ao fim arrasta o fim e mostra o erro e bloqueia o Salvar', () => {
    const estado: EstadoFerias = { periodos: [{ inicio: '2027-05-03', fim: '2027-05-07' }], recesso: null };
    const { form } = montar(estado);
    const [inicio, fim] = form.querySelectorAll<HTMLInputElement>('input[type=date]');

    digitar(inicio, '2027-05-20');
    expect(fim.value).toBe('2027-05-20');
    expect(form.querySelector('.dias')!.textContent).toBe('1 dia(s)');

    digitar(inicio, '2027-05-01');
    digitar(fim, '2027-06-15');
    expect(form.querySelector('.erros')!.textContent).toContain('Soma ultrapassa 30 dias (46).');
    expect(botaoSalvar(form).disabled).toBe(true);

    digitar(fim, '2027-05-10');
    expect(form.querySelector('.erros')).toBeNull();
    expect(botaoSalvar(form).disabled).toBe(false);
  });

  it('escolher o recesso atualiza o resumo sem redesenhar', () => {
    const estado: EstadoFerias = { periodos: [{ inicio: '2027-01-01', fim: '2027-01-05' }], recesso: null };
    const { form, redesenhar } = montar(estado);
    const radio = form.querySelector<HTMLInputElement>('input[type=radio][value=ano_novo]')!;

    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));

    expect(redesenhar).not.toHaveBeenCalled();
    expect(estado.recesso).toBe('ano_novo');
    expect(form.querySelector('.erros')!.textContent).toContain('Período 1 sobrepõe o recesso escolhido.');
    expect(botaoSalvar(form).disabled).toBe(true);
  });

  it('adicionar e remover período ainda pedem redesenho (muda a estrutura)', () => {
    const estado: EstadoFerias = { periodos: [], recesso: null };
    const { form, redesenhar } = montar(estado);
    [...form.querySelectorAll('button')].find(b => b.textContent === '+ Adicionar período')!.click();
    expect(estado.periodos).toHaveLength(1);
    expect(redesenhar).toHaveBeenCalledTimes(1);
  });
});
