import { diasCorridos, formatarBR } from '../lib/datas';
import { colegasFora } from '../lib/ocupacao';
import { FIM_ANO, INICIO_ANO, MAX_DIAS, periodoValido, statusProcurador, totalDias, validarMarcacao } from '../lib/regras';
import { ROTULO_RECESSO } from '../lib/rotulos';
import type { DadosPublicos, Periodo, Procurador, Recesso } from '../lib/tipos';
import { h } from './dom';

export interface EstadoFerias {
  periodos: Periodo[];
  recesso: Recesso | null;
}

export interface OpcoesFormFerias {
  dados: DadosPublicos;
  procurador: Procurador;
  estado: EstadoFerias;
  /** Chamado só quando a estrutura muda (adicionar/remover período); alterar datas atualiza no lugar. */
  redesenhar: () => void;
  salvar: (botao: HTMLButtonElement) => void;
}

interface LinhaPeriodo {
  per: Periodo;
  fim: HTMLInputElement;
  dias: HTMLElement;
  colegas: HTMLElement;
}

export function formularioFerias(op: OpcoesFormFerias): HTMLElement {
  const { dados, procurador, estado, redesenhar } = op;
  const linhas: LinhaPeriodo[] = [];

  // Os campos de data são criados uma vez: recriá-los a cada `change` tira o foco de quem digita.
  function itemPeriodo(per: Periodo, i: number): HTMLElement {
    const inicio = h('input', {
      type: 'date', min: INICIO_ANO, max: FIM_ANO, value: per.inicio,
      onchange: () => {
        per.inicio = inicio.value;
        if (per.inicio && (!per.fim || per.fim < per.inicio)) {
          per.fim = per.inicio;
          fim.value = per.fim;
        }
        atualizar();
      },
    });
    const fim: HTMLInputElement = h('input', {
      type: 'date', min: INICIO_ANO, max: FIM_ANO, value: per.fim,
      onchange: () => { per.fim = fim.value; atualizar(); },
    });
    const dias = h('span', { class: 'dias' });
    const colegas = h('p', { class: 'colegas' });
    linhas.push({ per, fim, dias, colegas });
    return h('li', { class: 'periodo' },
      h('div', { class: 'campos' },
        h('label', {}, 'Início', inicio),
        h('label', {}, 'Fim', fim),
        dias,
        h('button', {
          type: 'button', class: 'botao', 'aria-label': `Remover período ${i + 1}`,
          onclick: () => { estado.periodos.splice(i, 1); redesenhar(); },
        }, 'Remover')),
      colegas);
  }

  const contador = h('p', { 'aria-live': 'polite' });
  const areaErros = h('div', { class: 'erros-area' });
  const salvar = h('button', {
    type: 'button', class: 'botao primario',
    onclick: (e: Event) => op.salvar(e.currentTarget as HTMLButtonElement),
  }, 'Salvar');

  function atualizar(): void {
    for (const l of linhas) {
      const valido = periodoValido(l.per);
      l.fim.min = l.per.inicio || INICIO_ANO;
      l.dias.textContent = valido ? `${diasCorridos(l.per)} dia(s)` : '—';
      l.colegas.hidden = !valido;
      if (valido) {
        const colegas = colegasFora(dados, procurador.setor_id, l.per, procurador.id);
        l.colegas.textContent = colegas.length
          ? 'Colegas do setor fora neste período: ' + colegas
            .map(c => `${c.nome} (${formatarBR(c.inicio)}–${formatarBR(c.fim)}${c.motivo === 'recesso' ? ', recesso' : ''})`)
            .join('; ')
          : 'Ninguém do seu setor estará fora neste período.';
      }
    }

    const total = totalDias(estado.periodos);
    const status = statusProcurador(estado.periodos, estado.recesso);
    contador.className = total === MAX_DIAS ? 'contador completo' : total > MAX_DIAS ? 'contador excedido' : 'contador';
    contador.replaceChildren(`${total} / ${MAX_DIAS} dias`, h('span', { class: `selo ${status}` }, status));

    const erros = validarMarcacao(estado.periodos, estado.recesso, dados.recesso);
    areaErros.replaceChildren(
      ...(erros.length ? [h('ul', { class: 'erros', role: 'alert' }, ...erros.map(e => h('li', {}, e)))] : []));
    salvar.disabled = erros.length > 0;
  }

  const opcoesRecesso: Recesso[] = ['natal', 'ano_novo'];

  const form = h('div', { class: 'cartao form-ferias' },
    h('h2', {}, 'Períodos de férias (2027)'),
    estado.periodos.length
      ? h('ol', { class: 'periodos' }, ...estado.periodos.map(itemPeriodo))
      : h('p', { class: 'dica' }, 'Nenhum período marcado ainda.'),
    h('div', {}, h('button', {
      type: 'button', class: 'botao',
      onclick: () => { estado.periodos.push({ inicio: '', fim: '' }); redesenhar(); },
    }, '+ Adicionar período')),
    contador,
    h('fieldset', { class: 'recesso' },
      h('legend', {}, 'Recesso 2026/2027'),
      ...opcoesRecesso.map(opcao => h('label', { class: 'radio' },
        h('input', {
          type: 'radio', name: 'recesso', value: opcao, checked: estado.recesso === opcao,
          onchange: () => { estado.recesso = opcao; atualizar(); },
        }),
        `${ROTULO_RECESSO[opcao]}: ${formatarBR(dados.recesso[opcao].inicio)} a ${formatarBR(dados.recesso[opcao].fim)}`))),
    areaErros,
    h('div', {}, salvar));

  atualizar();
  return form;
}
