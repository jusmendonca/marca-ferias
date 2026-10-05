import './styles.css';
import { api, configurado } from './api';
import { mensagemDe } from './api/rpc';
import type { DadosPublicos } from './lib/tipos';
import { montarAdmin } from './ui/admin';
import { aviso, h } from './ui/dom';
import { montarEditor } from './ui/editor';
import { montarTelaPrincipal } from './ui/telaPrincipal';

const raiz = document.getElementById('app')!;
let cache: DadosPublicos | null = null;

async function recarregar(): Promise<DadosPublicos> {
  cache = await api.dadosPublicos();
  return cache;
}

async function rotear(): Promise<void> {
  if (!configurado) {
    raiz.replaceChildren(h('main', { class: 'pagina' },
      aviso('erro', 'App não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')));
    return;
  }
  const rota = location.hash.replace(/^#/, '') || '/';
  if (!cache) raiz.replaceChildren(h('main', { class: 'pagina' }, h('p', {}, 'Carregando…')));

  let dados: DadosPublicos;
  try {
    // A tela principal sempre busca dados novos (marcações de outras pessoas).
    dados = rota === '/' || !cache ? await recarregar() : cache;
  } catch (err) {
    raiz.replaceChildren(h('main', { class: 'pagina' },
      aviso('erro', mensagemDe(err)),
      h('p', {}, h('button', { type: 'button', class: 'botao', onclick: () => { void rotear(); } }, 'Tentar novamente'))));
    return;
  }

  if (rota === '/marcar') montarEditor(raiz, dados, recarregar);
  else if (rota === '/admin') montarAdmin(raiz, dados, recarregar);
  else montarTelaPrincipal(raiz, dados);
}

window.addEventListener('hashchange', () => { void rotear(); });
void rotear();
