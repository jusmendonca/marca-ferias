import { diasCorridos, formatarBR } from '../lib/datas';
import { ROTULO_ZOOM, type Zoom } from '../lib/escala';
import { periodosDe, setoresOrdenados } from '../lib/ocupacao';
import { statusProcurador, totalDias } from '../lib/regras';
import { ROTULO_RECESSO } from '../lib/rotulos';
import type { DadosPublicos } from '../lib/tipos';
import { h } from './dom';
import { renderGantt } from './gantt';

export function montarTelaPrincipal(raiz: HTMLElement, dados: DadosPublicos): void {
  let zoom: Zoom = 'ano';
  let setorId: number | null = null;
  const area = h('div', { class: 'area-gantt' });
  const dialogo = h('dialog', { class: 'dialogo' });

  const ativos = dados.procuradores.filter(p => p.ativo);
  const completos = ativos.filter(p => statusProcurador(periodosDe(dados, p.id), p.recesso) === 'completo').length;

  function desenhar(): void {
    area.replaceChildren(renderGantt(dados, { zoom, setorId, aoClicarProcurador: abrirDetalhes }));
  }

  function abrirDetalhes(id: number): void {
    const p = dados.procuradores.find(x => x.id === id);
    if (!p) return;
    const periodos = periodosDe(dados, id);
    const rec = p.recesso ? dados.recesso[p.recesso] : null;
    dialogo.replaceChildren(
      h('h2', {}, p.nome),
      h('p', {}, `${totalDias(periodos)} / 30 dias — `, h('span', { class: `selo ${statusProcurador(periodos, p.recesso)}` }, statusProcurador(periodos, p.recesso))),
      periodos.length
        ? h('ul', {}, ...periodos.map(x => h('li', {}, `${formatarBR(x.inicio)} a ${formatarBR(x.fim)} (${diasCorridos(x)} dias)`)))
        : h('p', {}, 'Nenhum período marcado.'),
      h('p', {}, p.recesso && rec
        ? `Recesso: ${ROTULO_RECESSO[p.recesso]} (${formatarBR(rec.inicio)} a ${formatarBR(rec.fim)})`
        : 'Recesso ainda não escolhido.'),
      h('form', { method: 'dialog' }, h('button', { class: 'botao' }, 'Fechar')));
    dialogo.showModal();
  }

  const zooms: Zoom[] = ['ano', 'trimestre', 'mes'];
  const botoesZoom: HTMLButtonElement[] = zooms.map(z => h('button', {
    type: 'button', class: 'botao', 'aria-pressed': String(z === zoom),
    onclick: (e: Event) => {
      zoom = z;
      for (const b of botoesZoom) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      desenhar();
    },
  }, ROTULO_ZOOM[z]));

  const filtro = h('select', {
    'aria-label': 'Filtrar por setor',
    onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      setorId = v ? Number(v) : null;
      desenhar();
    },
  }, h('option', { value: '' }, 'Todos os setores'), ...setoresOrdenados(dados).map(s => h('option', { value: String(s.id) }, s.nome)));

  const item = (classe: string, texto: string) =>
    h('span', { class: 'item-legenda' }, h('span', { class: `amostra ${classe}` }), texto);

  raiz.replaceChildren(h('main', { class: 'pagina larga' },
    h('header', { class: 'topo' },
      h('div', {}, h('h1', {}, 'Férias 2027'), h('p', { class: 'subtitulo' }, 'Núcleo de Educação — EFIN1')),
      h('a', { href: '#/marcar', class: 'botao primario' }, 'Marcar minhas férias')),
    h('div', { class: 'barra-ferramentas' },
      filtro,
      h('div', { class: 'grupo-zoom', role: 'group', 'aria-label': 'Zoom' }, ...botoesZoom),
      h('p', { class: 'contador-geral' }, `${completos} de ${ativos.length} Procuradores com marcação completa`)),
    h('div', { class: 'legenda' },
      item('ferias', 'Férias'), item('recesso', 'Recesso'), item('fds', 'Fim de semana'),
      item('feriado', 'Feriado'), item('facultativo', 'Ponto facultativo'), item('calor', 'Mais gente fora no setor')),
    area,
    dialogo,
    h('footer', { class: 'rodape' }, h('a', { href: '#/admin' }, 'Administração'))));
  desenhar();
}
