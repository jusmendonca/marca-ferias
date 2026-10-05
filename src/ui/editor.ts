import { api } from '../api';
import { ErroApi, mensagemDe } from '../api/rpc';
import { gravarSessao, lerSessao, limparSessao } from '../api/sessao';
import { periodosDe, procuradoresDoSetor, setoresOrdenados } from '../lib/ocupacao';
import type { DadosPublicos } from '../lib/tipos';
import { aviso, h } from './dom';
import { formularioFerias, type EstadoFerias } from './formFerias';

type Mensagem = { tipo: 'erro' | 'ok'; texto: string };

export function montarEditor(raiz: HTMLElement, inicial: DadosPublicos, recarregar: () => Promise<DadosPublicos>): void {
  let dados = inicial;
  let token: string | null = null;
  // Rascunho sobrevive à expiração da sessão (o usuário só redigita o PIN).
  let rascunho: (EstadoFerias & { procuradorId: number }) | null = null;

  const sessao = lerSessao('proc');
  if (sessao && sessao.procuradorId !== null && dados.procuradores.some(p => p.id === sessao.procuradorId && p.ativo)) {
    token = sessao.token;
    editar(sessao.procuradorId);
  } else {
    limparSessao('proc');
    escolher();
  }

  function tela(...filhos: (Node | null)[]): void {
    raiz.replaceChildren(h('main', { class: 'pagina' },
      h('a', { href: '#/', class: 'voltar' }, '← Voltar ao calendário'),
      h('h1', {}, 'Marcar minhas férias'),
      ...filhos));
  }

  function escolher(erro?: string): void {
    const selNome = h('select', { id: 'sel-nome', required: true, disabled: true },
      h('option', { value: '' }, 'Escolha o setor primeiro'));
    const selSetor = h('select', {
      id: 'sel-setor', required: true,
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        const procs = v ? procuradoresDoSetor(dados, Number(v)) : [];
        selNome.replaceChildren(
          h('option', { value: '' }, procs.length ? 'Escolha seu nome' : 'Nenhum nome neste setor'),
          ...procs.map(p => h('option', { value: String(p.id) }, p.nome)));
        selNome.disabled = procs.length === 0;
      },
    }, h('option', { value: '' }, 'Escolha seu setor'), ...setoresOrdenados(dados).map(s => h('option', { value: String(s.id) }, s.nome)));

    tela(h('form', {
      class: 'cartao',
      onsubmit: (e: Event) => { e.preventDefault(); if (selNome.value) pedirPin(Number(selNome.value)); },
    },
    erro ? aviso('erro', erro) : null,
    h('label', { for: 'sel-setor' }, 'Setor'), selSetor,
    h('label', { for: 'sel-nome' }, 'Nome'), selNome,
    h('div', {}, h('button', { type: 'submit', class: 'botao primario' }, 'Continuar'))));
  }

  function pedirPin(procuradorId: number, erro?: string): void {
    const p = dados.procuradores.find(x => x.id === procuradorId);
    if (!p) { escolher(); return; }
    const primeiro = !p.tem_pin;
    const pin = h('input', {
      id: 'pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]{4,6}', minlength: 4, maxlength: 6, required: true,
      autocomplete: primeiro ? 'new-password' : 'current-password',
    });
    const confirmacao = primeiro
      ? h('input', { id: 'pin2', type: 'password', inputmode: 'numeric', pattern: '[0-9]{4,6}', minlength: 4, maxlength: 6, required: true, autocomplete: 'new-password' })
      : null;

    tela(h('form', {
      class: 'cartao',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        if (confirmacao && confirmacao.value !== pin.value) { pedirPin(procuradorId, 'Os PINs não conferem.'); return; }
        const botao = (e.target as HTMLFormElement).querySelector('button[type=submit]') as HTMLButtonElement;
        botao.disabled = true;
        try {
          token = primeiro ? await api.definirPin(procuradorId, pin.value) : await api.entrar(procuradorId, pin.value);
          gravarSessao('proc', token, procuradorId);
          if (primeiro) dados = await recarregar();
          editar(procuradorId);
        } catch (err) {
          // Se outra pessoa criou o PIN nesse meio-tempo, `tem_pin` mudou.
          if (primeiro) dados = await recarregar().catch(() => dados);
          pedirPin(procuradorId, mensagemDe(err));
        }
      },
    },
    h('p', {}, h('strong', {}, p.nome)),
    erro ? aviso('erro', erro) : null,
    h('p', { class: 'dica' }, primeiro
      ? 'Primeiro acesso: crie um PIN de 4 a 6 dígitos. Guarde-o — ele protege suas marcações. Se esquecer, peça ao administrador para resetar.'
      : 'Digite seu PIN.'),
    h('label', { for: 'pin' }, 'PIN'), pin,
    confirmacao ? h('label', { for: 'pin2' }, 'Confirme o PIN') : null, confirmacao,
    h('div', {},
      h('button', { type: 'submit', class: 'botao primario' }, primeiro ? 'Criar PIN e entrar' : 'Entrar'), ' ',
      h('button', { type: 'button', class: 'botao', onclick: () => escolher() }, 'Não sou eu'))));
    pin.focus();
  }

  function editar(procuradorId: number, msg?: Mensagem): void {
    const p = dados.procuradores.find(x => x.id === procuradorId && x.ativo);
    const t = token;
    if (!p || !t) { limparSessao('proc'); escolher(); return; }
    if (!rascunho || rascunho.procuradorId !== procuradorId) {
      rascunho = {
        procuradorId,
        periodos: periodosDe(dados, procuradorId).map(({ inicio, fim }) => ({ inicio, fim })),
        recesso: p.recesso,
      };
    }
    const estado = rascunho;

    tela(
      h('div', { class: 'cabecalho-editor' },
        h('p', {}, 'Editando as férias de ', h('strong', {}, p.nome)),
        h('button', {
          type: 'button', class: 'botao',
          onclick: async () => {
            await api.sair(t).catch(() => undefined);
            limparSessao('proc');
            token = null;
            rascunho = null;
            escolher();
          },
        }, 'Sair')),
      msg ? aviso(msg.tipo, msg.texto) : null,
      formularioFerias({
        dados, procurador: p, estado,
        redesenhar: () => editar(procuradorId),
        salvar: async botao => {
          botao.disabled = true;
          botao.textContent = 'Salvando…';
          try {
            await api.salvarMinhasFerias(t, estado.periodos, estado.recesso);
            dados = await recarregar();
            rascunho = null;
            editar(procuradorId, { tipo: 'ok', texto: 'Férias salvas com sucesso.' });
          } catch (err) {
            if (err instanceof ErroApi && err.sessaoExpirada) {
              limparSessao('proc');
              token = null;
              pedirPin(procuradorId, 'Sua sessão expirou. Digite o PIN novamente — suas alterações foram mantidas.');
              return;
            }
            editar(procuradorId, { tipo: 'erro', texto: mensagemDe(err) });
          }
        },
      }));
  }
}
