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
  redesenhar: () => void;
  salvar: (botao: HTMLButtonElement) => void;
}

export function formularioFerias(op: OpcoesFormFerias): HTMLElement {
  const { dados, procurador, estado, redesenhar } = op;
  const erros = validarMarcacao(estado.periodos, estado.recesso, dados.recesso);
  const total = totalDias(estado.periodos);
  const status = statusProcurador(estado.periodos, estado.recesso);

  function itemPeriodo(per: Periodo, i: number): HTMLElement {
    const valido = periodoValido(per);
    const colegas = valido ? colegasFora(dados, procurador.setor_id, per, procurador.id) : [];
    const textoColegas = colegas.length
      ? 'Colegas do setor fora neste período: ' + colegas
        .map(c => `${c.nome} (${formatarBR(c.inicio)}–${formatarBR(c.fim)}${c.motivo === 'recesso' ? ', recesso' : ''})`)
        .join('; ')
      : 'Ninguém do seu setor estará fora neste período.';
    return h('li', { class: 'periodo' },
      h('div', { class: 'campos' },
        h('label', {}, 'Início', h('input', {
          type: 'date', min: INICIO_ANO, max: FIM_ANO, value: per.inicio,
          onchange: (e: Event) => {
            per.inicio = (e.target as HTMLInputElement).value;
            if (per.inicio && (!per.fim || per.fim < per.inicio)) per.fim = per.inicio;
            redesenhar();
          },
        })),
        h('label', {}, 'Fim', h('input', {
          type: 'date', min: per.inicio || INICIO_ANO, max: FIM_ANO, value: per.fim,
          onchange: (e: Event) => { per.fim = (e.target as HTMLInputElement).value; redesenhar(); },
        })),
        h('span', { class: 'dias' }, valido ? `${diasCorridos(per)} dia(s)` : '—'),
        h('button', {
          type: 'button', class: 'botao', 'aria-label': `Remover período ${i + 1}`,
          onclick: () => { estado.periodos.splice(i, 1); redesenhar(); },
        }, 'Remover')),
      valido ? h('p', { class: 'colegas' }, textoColegas) : null);
  }

  const opcoesRecesso: Recesso[] = ['natal', 'ano_novo'];
  const classeContador = total === MAX_DIAS ? 'contador completo' : total > MAX_DIAS ? 'contador excedido' : 'contador';

  return h('div', { class: 'cartao form-ferias' },
    h('h2', {}, 'Períodos de férias (2027)'),
    estado.periodos.length
      ? h('ol', { class: 'periodos' }, ...estado.periodos.map(itemPeriodo))
      : h('p', { class: 'dica' }, 'Nenhum período marcado ainda.'),
    h('div', {}, h('button', {
      type: 'button', class: 'botao',
      onclick: () => { estado.periodos.push({ inicio: '', fim: '' }); redesenhar(); },
    }, '+ Adicionar período')),
    h('p', { class: classeContador, 'aria-live': 'polite' }, `${total} / ${MAX_DIAS} dias`, h('span', { class: `selo ${status}` }, status)),
    h('fieldset', { class: 'recesso' },
      h('legend', {}, 'Recesso 2026/2027'),
      ...opcoesRecesso.map(opcao => h('label', { class: 'radio' },
        h('input', {
          type: 'radio', name: 'recesso', value: opcao, checked: estado.recesso === opcao,
          onchange: () => { estado.recesso = opcao; redesenhar(); },
        }),
        `${ROTULO_RECESSO[opcao]}: ${formatarBR(dados.recesso[opcao].inicio)} a ${formatarBR(dados.recesso[opcao].fim)}`))),
    erros.length ? h('ul', { class: 'erros', role: 'alert' }, ...erros.map(e => h('li', {}, e))) : null,
    h('div', {}, h('button', {
      type: 'button', class: 'botao primario', disabled: erros.length > 0,
      onclick: (e: Event) => op.salvar(e.currentTarget as HTMLButtonElement),
    }, 'Salvar')));
}
