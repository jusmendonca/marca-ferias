import { api } from '../api';
import { ErroApi, mensagemDe } from '../api/rpc';
import { gravarSessao, lerSessao, limparSessao } from '../api/sessao';
import { gerarCsv } from '../lib/csv';
import { formatarBR } from '../lib/datas';
import { periodosDe, procuradoresDoSetor, setoresOrdenados } from '../lib/ocupacao';
import { statusProcurador, totalDias, validarMarcacao } from '../lib/regras';
import { ROTULO_RECESSO } from '../lib/rotulos';
import type { DadosPublicos, DiaEspecial } from '../lib/tipos';
import { aviso, h } from './dom';
import { formularioFerias, type EstadoFerias } from './formFerias';

type Mensagem = { tipo: 'erro' | 'ok'; texto: string };

function baixarCsv(dados: DadosPublicos): void {
  // BOM para o Excel reconhecer UTF-8 (acentos).
  const blob = new Blob(['﻿' + gerarCsv(dados)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'ferias-2027.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cabecalhoTabela = (...colunas: string[]) => h('thead', {}, h('tr', {}, ...colunas.map(c => h('th', {}, c))));

export function montarAdmin(raiz: HTMLElement, inicial: DadosPublicos, recarregar: () => Promise<DadosPublicos>): void {
  let dados = inicial;
  let token: string | null = lerSessao('admin')?.token ?? null;
  let edicao: { procuradorId: number; estado: EstadoFerias } | null = null;

  if (token) painel();
  else login();

  function tela(...filhos: (Node | null)[]): void {
    raiz.replaceChildren(h('main', { class: 'pagina larga' },
      h('a', { href: '#/', class: 'voltar' }, '← Voltar ao calendário'),
      h('h1', {}, 'Administração'),
      ...filhos));
  }

  async function executar(acao: () => Promise<unknown>, sucesso: string): Promise<void> {
    try {
      await acao();
      dados = await recarregar();
      painel({ tipo: 'ok', texto: sucesso });
    } catch (err) {
      if (err instanceof ErroApi && err.sessaoExpirada) {
        limparSessao('admin');
        token = null;
        login('Sessão expirada. Entre novamente.');
        return;
      }
      painel({ tipo: 'erro', texto: mensagemDe(err) });
    }
  }

  function login(erro?: string): void {
    const senha = h('input', { id: 'senha-admin', type: 'password', autocomplete: 'current-password', required: true });
    tela(h('form', {
      class: 'cartao',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        try {
          token = await api.adminEntrar(senha.value);
          gravarSessao('admin', token, null);
          painel();
        } catch (err) {
          login(mensagemDe(err));
        }
      },
    },
    erro ? aviso('erro', erro) : null,
    h('label', { for: 'senha-admin' }, 'Senha de administrador'), senha,
    h('div', {}, h('button', { type: 'submit', class: 'botao primario' }, 'Entrar'))));
    senha.focus();
  }

  function painel(msg?: Mensagem): void {
    const t = token;
    if (!t) { login(); return; }
    tela(
      h('div', { class: 'barra-acoes' },
        h('button', { type: 'button', class: 'botao', onclick: () => baixarCsv(dados) }, 'Exportar CSV'),
        h('button', {
          type: 'button', class: 'botao',
          onclick: async () => {
            await api.sair(t).catch(() => undefined);
            limparSessao('admin');
            token = null;
            login();
          },
        }, 'Sair')),
      msg ? aviso(msg.tipo, msg.texto) : null,
      edicao ? secaoEdicao(t, edicao) : null,
      secaoStatus(t),
      secaoSetores(t),
      secaoProcuradores(t),
      secaoDias(t),
      secaoRecesso(t),
      secaoSenha(t));
  }

  function secaoEdicao(t: string, ed: { procuradorId: number; estado: EstadoFerias }): HTMLElement | null {
    const p = dados.procuradores.find(x => x.id === ed.procuradorId);
    if (!p) return null;
    return h('section', { class: 'cartao destaque' },
      h('h2', {}, `Editando férias de ${p.nome}`),
      formularioFerias({
        dados, procurador: p, estado: ed.estado,
        redesenhar: () => painel(),
        salvar: () => {
          void executar(async () => {
            await api.adminSalvarFerias(t, p.id, ed.estado.periodos, ed.estado.recesso);
            edicao = null;
          }, `Férias de ${p.nome} salvas.`);
        },
      }),
      h('div', {}, h('button', { type: 'button', class: 'botao', onclick: () => { edicao = null; painel(); } }, 'Cancelar edição')));
  }

  function secaoStatus(t: string): HTMLElement {
    const linhas: HTMLElement[] = [];
    let ativos = 0;
    let completos = 0;
    for (const s of setoresOrdenados(dados)) {
      for (const p of procuradoresDoSetor(dados, s.id)) {
        const per = periodosDe(dados, p.id);
        const status = statusProcurador(per, p.recesso);
        const conflitos = validarMarcacao(per, p.recesso, dados.recesso);
        ativos++;
        if (status === 'completo') completos++;
        linhas.push(h('tr', {},
          h('td', {}, s.nome),
          h('td', {}, p.nome),
          h('td', {}, `${totalDias(per)} / 30`),
          h('td', {}, p.recesso ? ROTULO_RECESSO[p.recesso] : '—'),
          h('td', {}, h('span', { class: `selo ${status}` }, status)),
          h('td', { class: conflitos.length ? 'conflito' : '' }, conflitos.length ? '⚠ ' + conflitos.join(' ') : '—'),
          h('td', {},
            h('button', {
              type: 'button', class: 'botao',
              onclick: () => {
                edicao = { procuradorId: p.id, estado: { periodos: per.map(({ inicio, fim }) => ({ inicio, fim })), recesso: p.recesso } };
                painel();
                window.scrollTo(0, 0);
              },
            }, 'Editar férias'), ' ',
            h('button', {
              type: 'button', class: 'botao', disabled: !p.tem_pin,
              onclick: () => {
                if (confirm(`Resetar o PIN de ${p.nome}? A pessoa criará um novo PIN no próximo acesso.`)) {
                  void executar(() => api.adminResetarPin(t, p.id), `PIN de ${p.nome} resetado.`);
                }
              },
            }, 'Resetar PIN'))));
      }
    }
    return h('section', { class: 'cartao' },
      h('h2', {}, `Status (${completos} de ${ativos} completos)`),
      h('div', { class: 'tabela-rolavel' }, h('table', {},
        cabecalhoTabela('Setor', 'Nome', 'Dias', 'Recesso', 'Status', 'Conflitos', ''),
        h('tbody', {}, ...linhas))));
  }

  function secaoSetores(t: string): HTMLElement {
    const linhas = setoresOrdenados(dados).map(s => {
      const nome = h('input', { value: s.nome, 'aria-label': 'Nome do setor' });
      const ordem = h('input', { type: 'number', class: 'curto', value: String(s.ordem), 'aria-label': 'Ordem' });
      return h('tr', {},
        h('td', {}, nome), h('td', {}, ordem),
        h('td', {},
          h('button', { type: 'button', class: 'botao', onclick: () => { void executar(() => api.adminSalvarSetor(t, s.id, nome.value, Number(ordem.value) || 0), 'Setor salvo.'); } }, 'Salvar'), ' ',
          h('button', {
            type: 'button', class: 'botao perigo',
            onclick: () => { if (confirm(`Excluir o setor "${s.nome}"?`)) void executar(() => api.adminExcluirSetor(t, s.id), 'Setor excluído.'); },
          }, 'Excluir')));
    });
    const novoNome = h('input', { placeholder: 'Novo setor', 'aria-label': 'Nome do novo setor' });
    const novaOrdem = h('input', { type: 'number', class: 'curto', value: '0', 'aria-label': 'Ordem do novo setor' });
    return h('section', { class: 'cartao' },
      h('h2', {}, 'Setores'),
      h('div', { class: 'tabela-rolavel' }, h('table', {},
        cabecalhoTabela('Nome', 'Ordem', ''),
        h('tbody', {}, ...linhas,
          h('tr', {}, h('td', {}, novoNome), h('td', {}, novaOrdem),
            h('td', {}, h('button', {
              type: 'button', class: 'botao primario',
              onclick: () => { void executar(() => api.adminSalvarSetor(t, null, novoNome.value, Number(novaOrdem.value) || 0), 'Setor criado.'); },
            }, 'Adicionar')))))));
  }

  function selectSetor(atual: number | null, rotulo: string): HTMLSelectElement {
    return h('select', { 'aria-label': rotulo },
      h('option', { value: '' }, 'Escolha o setor'),
      ...setoresOrdenados(dados).map(s => h('option', { value: String(s.id), selected: s.id === atual }, s.nome)));
  }

  function secaoProcuradores(t: string): HTMLElement {
    const ordenados = [...dados.procuradores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const linhas = ordenados.map(p => {
      const nome = h('input', { value: p.nome, 'aria-label': 'Nome' });
      const setor = selectSetor(p.setor_id, 'Setor');
      const ativo = h('input', { type: 'checkbox', checked: p.ativo, 'aria-label': 'Ativo' });
      return h('tr', {},
        h('td', {}, nome), h('td', {}, setor), h('td', {}, ativo),
        h('td', {},
          h('button', {
            type: 'button', class: 'botao',
            onclick: () => { void executar(() => api.adminSalvarProcurador(t, p.id, nome.value, Number(setor.value) || null, ativo.checked), 'Procurador salvo.'); },
          }, 'Salvar'), ' ',
          h('button', {
            type: 'button', class: 'botao perigo',
            onclick: () => { if (confirm(`Excluir ${p.nome} e todas as suas marcações?`)) void executar(() => api.adminExcluirProcurador(t, p.id), 'Procurador excluído.'); },
          }, 'Excluir')));
    });
    const novoNome = h('input', { placeholder: 'Nome do Procurador', 'aria-label': 'Nome do novo Procurador' });
    const novoSetor = selectSetor(null, 'Setor do novo Procurador');
    return h('section', { class: 'cartao' },
      h('h2', {}, 'Procuradores'),
      h('p', { class: 'dica' }, 'Inativos somem do calendário e da contagem do setor, mas mantêm o histórico.'),
      h('div', { class: 'tabela-rolavel' }, h('table', {},
        cabecalhoTabela('Nome', 'Setor', 'Ativo', ''),
        h('tbody', {}, ...linhas,
          h('tr', {}, h('td', {}, novoNome), h('td', {}, novoSetor), h('td', {}, ''),
            h('td', {}, h('button', {
              type: 'button', class: 'botao primario',
              onclick: () => { void executar(() => api.adminSalvarProcurador(t, null, novoNome.value, Number(novoSetor.value) || null, true), 'Procurador adicionado.'); },
            }, 'Adicionar')))))));
  }

  function secaoDias(t: string): HTMLElement {
    const linhas = dados.dias_especiais.map(d => h('tr', {},
      h('td', {}, formatarBR(d.data)),
      h('td', {}, d.tipo === 'feriado' ? 'Feriado' : 'Ponto facultativo'),
      h('td', {}, d.descricao),
      h('td', {}, h('button', {
        type: 'button', class: 'botao perigo',
        onclick: () => { void executar(() => api.adminExcluirDiaEspecial(t, d.data), 'Dia removido.'); },
      }, 'Remover'))));
    const data = h('input', { type: 'date', 'aria-label': 'Data' });
    const tipo = h('select', { 'aria-label': 'Tipo' },
      h('option', { value: 'facultativo' }, 'Ponto facultativo'),
      h('option', { value: 'feriado' }, 'Feriado'));
    const descricao = h('input', { placeholder: 'Descrição', 'aria-label': 'Descrição' });
    return h('section', { class: 'cartao' },
      h('h2', {}, 'Feriados e pontos facultativos'),
      h('p', { class: 'dica' }, 'Para alterar um dia já cadastrado, adicione-o de novo com a mesma data.'),
      h('div', { class: 'tabela-rolavel' }, h('table', {},
        cabecalhoTabela('Data', 'Tipo', 'Descrição', ''),
        h('tbody', {}, ...linhas,
          h('tr', {}, h('td', {}, data), h('td', {}, tipo), h('td', {}, descricao),
            h('td', {}, h('button', {
              type: 'button', class: 'botao primario',
              onclick: () => {
                if (!data.value) { painel({ tipo: 'erro', texto: 'Informe a data.' }); return; }
                const dia: DiaEspecial = { data: data.value, tipo: tipo.value as DiaEspecial['tipo'], descricao: descricao.value };
                void executar(() => api.adminSalvarDiaEspecial(t, dia), 'Dia salvo.');
              },
            }, 'Adicionar')))))));
  }

  function secaoRecesso(t: string): HTMLElement {
    const campo = (rotulo: string, valor: string) => h('input', { type: 'date', value: valor, 'aria-label': rotulo });
    const ni = campo('Natal — início', dados.recesso.natal.inicio);
    const nf = campo('Natal — fim', dados.recesso.natal.fim);
    const ai = campo('Ano-Novo — início', dados.recesso.ano_novo.inicio);
    const af = campo('Ano-Novo — fim', dados.recesso.ano_novo.fim);
    return h('section', { class: 'cartao' },
      h('h2', {}, 'Recesso'),
      h('div', { class: 'grade-recesso' },
        h('span', {}), h('strong', {}, 'Início'), h('strong', {}, 'Fim'),
        h('span', {}, 'Natal'), ni, nf,
        h('span', {}, 'Ano-Novo'), ai, af),
      h('p', { class: 'dica' }, 'Alterar as datas não apaga marcações; quem ficar em conflito aparece na coluna "Conflitos" do status.'),
      h('div', {}, h('button', {
        type: 'button', class: 'botao primario',
        onclick: () => {
          if (![ni, nf, ai, af].every(c => c.value)) { painel({ tipo: 'erro', texto: 'Datas de recesso inválidas.' }); return; }
          void executar(() => api.adminSalvarRecesso(t, {
            natal: { inicio: ni.value, fim: nf.value },
            ano_novo: { inicio: ai.value, fim: af.value },
          }), 'Recesso salvo.');
        },
      }, 'Salvar recesso')));
  }

  function secaoSenha(t: string): HTMLElement {
    const atual = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Senha atual' });
    const nova = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Nova senha' });
    const conf = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': 'Confirme a nova senha' });
    return h('section', { class: 'cartao' },
      h('h2', {}, 'Trocar senha de administrador'),
      h('label', {}, 'Senha atual', atual),
      h('label', {}, 'Nova senha (mínimo 8 caracteres)', nova),
      h('label', {}, 'Confirme a nova senha', conf),
      h('div', {}, h('button', {
        type: 'button', class: 'botao',
        onclick: () => {
          if (nova.value !== conf.value) { painel({ tipo: 'erro', texto: 'As senhas não conferem.' }); return; }
          void executar(() => api.adminTrocarSenha(t, atual.value, nova.value), 'Senha alterada.');
        },
      }, 'Trocar senha')));
  }
}
