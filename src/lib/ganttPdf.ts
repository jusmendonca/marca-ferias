import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { diasBloqueados } from './bloqueios';
import { trechosDoSetor } from './criticos';
import { diaDaSemana, formatarBR, somarDias } from './datas';
import { indiceDia, INICIO_GANTT, meses, totalDiasGantt } from './escala';
import { ausenciasNoDia, periodosDe, procuradoresDoSetor, setoresOrdenados } from './ocupacao';
import { statusProcurador } from './regras';
import { ROTULO_RECESSO } from './rotulos';
import type { DadosPublicos, Periodo } from './tipos';

type Cor = [number, number, number];

const PAGINA = { largura: 297, altura: 210, margem: 10 };
const COL_NOME = 52;
const X0 = PAGINA.margem + COL_NOME;
const LARGURA_TRILHA = PAGINA.largura - PAGINA.margem - X0;
const ALTURA_LINHA = 8;
const ALTURA_OCUPACAO = 6;
const MIN_DIAS_COM_TEXTO = 6;
const MINIMO_PRESENCA_PCT = 70;
const MOTIVO = { ferias: 'férias', recesso: 'recesso', bloqueio: 'bloqueio' } as const;

const AZUL: Cor = [47, 125, 225];
const AZUL_CLARO: Cor = [163, 196, 243];
const ROXO: Cor = [138, 92, 246];
const ROXO_CLARO: Cor = [212, 195, 251];
const VERMELHO: Cor = [220, 38, 38];
const CINZA: Cor = [90, 101, 119];
const TEXTO: Cor = [28, 36, 48];
const FUNDO_DIA: Record<string, Cor> = {
  fds: [233, 235, 239],
  feriado: [250, 224, 190],
  facultativo: [250, 240, 190],
};

const misturar = (cor: Cor, alfa: number): Cor => cor.map(c => Math.round(c * alfa + 255 * (1 - alfa))) as Cor;

/** Faixa horizontal do período dentro da trilha, em mm (null se fora da escala). */
function faixa(p: Periodo): { x: number; w: number } | null {
  const n = totalDiasGantt();
  const ini = Math.max(indiceDia(p.inicio), 0);
  const fim = Math.min(indiceDia(p.fim), n - 1);
  if (fim < ini) return null;
  return { x: X0 + (ini / n) * LARGURA_TRILHA, w: ((fim - ini + 1) / n) * LARGURA_TRILHA };
}

function retangulo(doc: jsPDF, p: Periodo, y: number, h: number, preenchimento: Cor, borda?: Cor): void {
  const f = faixa(p);
  if (!f) return;
  doc.setFillColor(...preenchimento);
  if (borda) {
    doc.setDrawColor(...borda);
    doc.setLineWidth(0.2);
    doc.rect(f.x, y, f.w, h, 'FD');
  } else {
    doc.rect(f.x, y, f.w, h, 'F');
  }
}

/** Fins de semana, feriados e pontos facultativos, agrupados em faixas contínuas. */
function fundoDias(dados: DadosPublicos): { periodo: Periodo; cor: Cor }[] {
  const especiais = new Map(dados.dias_especiais.map(d => [d.data, d.tipo]));
  const r: { periodo: Periodo; cor: Cor; classe: string }[] = [];
  for (let i = 0; i < totalDiasGantt(); i++) {
    const dia = somarDias(INICIO_GANTT, i);
    const dow = diaDaSemana(dia);
    const classe = especiais.get(dia) ?? (dow === 0 || dow === 6 ? 'fds' : null);
    if (!classe) continue;
    const ultimo = r[r.length - 1];
    if (ultimo && ultimo.classe === classe && somarDias(ultimo.periodo.fim, 1) === dia) ultimo.periodo.fim = dia;
    else r.push({ classe, cor: FUNDO_DIA[classe], periodo: { inicio: dia, fim: dia } });
  }
  return r;
}

export function gerarGanttPdf(dados: DadosPublicos, setorId: number | null = null): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const fundos = fundoDias(dados);
  const limiteY = PAGINA.altura - PAGINA.margem;
  let y = PAGINA.margem;

  const garantirEspaco = (altura: number) => {
    if (y + altura > limiteY) { doc.addPage(); y = PAGINA.margem; }
  };
  const texto = (t: string, x: number, yy: number, tam: number, cor: Cor = TEXTO, estilo: 'normal' | 'bold' = 'normal', alinhar: 'left' | 'center' = 'left') => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    doc.text(t, x, yy, { align: alinhar });
  };

  texto('Férias 2027 — Núcleo de Educação (EFIN1)', PAGINA.margem, y + 4, 14, TEXTO, 'bold');
  texto(`Gantt de 21/12/2026 a 31/12/2027 · gerado em ${formatarBR(new Date().toISOString().slice(0, 10))}`, PAGINA.margem, y + 9, 8, CINZA);
  y += 13;

  const n = totalDiasGantt();
  const cabecalhoMeses = () => {
    for (const m of meses()) {
      const x = X0 + (m.inicio / n) * LARGURA_TRILHA;
      doc.setDrawColor(201, 208, 218);
      doc.setLineWidth(0.15);
      doc.line(x, y, x, y + 4);
      if (m.dias >= 10) texto(m.rotulo, x + 0.8, y + 3, 6, CINZA);
    }
    y += 4.5;
  };

  const setores = setoresOrdenados(dados).filter(s => setorId === null || s.id === setorId);
  for (const s of setores) {
    const procs = procuradoresDoSetor(dados, s.id);
    if (!procs.length) continue;

    garantirEspaco(6 + 4.5 + ALTURA_LINHA * Math.min(procs.length, 3) + ALTURA_OCUPACAO);
    texto(`${s.nome} (${procs.length})`, PAGINA.margem, y + 4, 10, TEXTO, 'bold');
    y += 6;
    cabecalhoMeses();

    for (const p of procs) {
      garantirEspaco(ALTURA_LINHA + ALTURA_OCUPACAO);
      const periodos = periodosDe(dados, p.id);
      for (const f of fundos) retangulo(doc, f.periodo, y, ALTURA_LINHA, f.cor);
      doc.setDrawColor(227, 231, 237);
      doc.setLineWidth(0.1);
      doc.line(PAGINA.margem, y + ALTURA_LINHA, PAGINA.largura - PAGINA.margem, y + ALTURA_LINHA);
      doc.line(X0, y, X0, y + ALTURA_LINHA);

      for (const per of periodos) {
        for (const dia of diasBloqueados(per, dados)) retangulo(doc, { inicio: dia, fim: dia }, y + 1.8, 4.4, AZUL_CLARO, AZUL);
      }
      for (const per of periodos) retangulo(doc, per, y + 1.8, 4.4, AZUL);
      if (p.recesso) retangulo(doc, dados.recesso[p.recesso], y + 1.8, 4.4, ROXO_CLARO, ROXO);

      const datas = periodos.map(x => `${formatarBR(x.inicio).slice(0, 5)}–${formatarBR(x.fim).slice(0, 5)}`).join(', ');
      const detalhe = `${datas || 'sem férias marcadas'}${p.recesso ? ` · recesso ${ROTULO_RECESSO[p.recesso]}` : ''}`;
      const nome = statusProcurador(periodos, p.recesso) === 'completo' ? p.nome : `${p.nome} (pendente)`;
      texto(nome, PAGINA.margem + 1, y + 3.2, 7.5);
      texto(doc.splitTextToSize(detalhe, COL_NOME - 2)[0], PAGINA.margem + 1, y + 6.4, 5.5, CINZA);
      y += ALTURA_LINHA;
    }

    // Linha "Presentes no setor": vermelho proporcional à fração de ausentes, com o % de quem fica.
    garantirEspaco(ALTURA_OCUPACAO);
    texto('Presentes no setor', PAGINA.margem + 1, y + 2.6, 6.5, TEXTO, 'bold');
    texto('percentual de quem fica', PAGINA.margem + 1, y + 5, 5, CINZA);
    let ini = 0;
    let atual: { alfa: number; pct: number } | null = null;
    const fechar = (fim: number) => {
      if (!atual) return;
      const per = { inicio: somarDias(INICIO_GANTT, ini), fim: somarDias(INICIO_GANTT, fim) };
      const cor = misturar(VERMELHO, atual.alfa);
      retangulo(doc, per, y, ALTURA_OCUPACAO, cor);
      const f = faixa(per);
      if (f && fim - ini + 1 >= MIN_DIAS_COM_TEXTO) {
        texto(`${atual.pct}%`, f.x + f.w / 2, y + 4, 5.5, atual.alfa > 0.5 ? [255, 255, 255] : TEXTO, 'normal', 'center');
      }
    };
    for (let i = 0; i < n; i++) {
      const o = ausenciasNoDia(dados, s.id, somarDias(INICIO_GANTT, i));
      const alfa = o.total ? Math.round(((o.total - o.presentes) / o.total) * 0.9 * 100) / 100 : 0;
      if (!atual || atual.alfa !== alfa) {
        if (atual) fechar(i - 1);
        ini = i;
        atual = { alfa, pct: Math.round((o.presentes / (o.total || 1)) * 100) };
      }
    }
    fechar(n - 1);
    y += ALTURA_OCUPACAO + 3;

    // Discriminação dos períodos de ausência do setor.
    const trechos = trechosDoSetor(dados, s.id).filter(t => t.ausentes.length > 0);
    garantirEspaco(18);
    texto(`Períodos de ausência — ${s.nome}`, PAGINA.margem, y + 3, 8.5, TEXTO, 'bold');
    y += 4.5;
    if (!trechos.length) {
      texto('Nenhuma ausência no setor.', PAGINA.margem, y + 3, 7, CINZA);
      y += 7;
      continue;
    }
    autoTable(doc, {
      startY: y,
      margin: { left: PAGINA.margem, right: PAGINA.margem, bottom: PAGINA.margem },
      head: [['Período (dias úteis)', 'Dias úteis', 'Presentes (%)', 'Presentes', 'Ausentes', 'Quem está ausente']],
      body: trechos.map(t => [
        t.inicio === t.fim ? formatarBR(t.inicio) : `${formatarBR(t.inicio)} a ${formatarBR(t.fim)}`,
        String(t.diasUteis),
        `${Math.round(t.pct)}%`,
        `${t.presentes} de ${t.total}`,
        String(t.ausentes.length),
        t.ausentes.map(a => `${a.procurador.nome} (${MOTIVO[a.motivo]})`).join(', '),
      ]),
      styles: { fontSize: 7, cellPadding: 1.2, textColor: TEXTO, lineColor: [227, 231, 237], lineWidth: 0.1 },
      headStyles: { fillColor: [240, 243, 247], textColor: TEXTO, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', fontStyle: 'bold' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      didParseCell: d => {
        if (d.section === 'body' && trechos[d.row.index].pct < MINIMO_PRESENCA_PCT) d.cell.styles.textColor = [180, 35, 24];
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // Legenda na última página.
  garantirEspaco(8);
  const itens: [string, Cor, Cor | undefined][] = [
    ['Férias', AZUL, undefined], ['Bloqueio de distribuição', AZUL_CLARO, AZUL], ['Recesso', ROXO_CLARO, ROXO],
    ['Presentes no setor (mais vermelho = mais ausentes)', misturar(VERMELHO, 0.6), undefined],
    ['Fim de semana', FUNDO_DIA.fds, undefined], ['Feriado', FUNDO_DIA.feriado, undefined], ['Ponto facultativo', FUNDO_DIA.facultativo, undefined],
  ];
  let x = PAGINA.margem;
  for (const [rotulo, cor, borda] of itens) {
    doc.setFillColor(...cor);
    if (borda) { doc.setDrawColor(...borda); doc.setLineWidth(0.2); doc.rect(x, y, 5, 3, 'FD'); } else doc.rect(x, y, 5, 3, 'F');
    texto(rotulo, x + 6.5, y + 2.4, 6.5);
    x += 8 + doc.getTextWidth(rotulo);
  }
  texto('Linhas em vermelho nas tabelas: presença abaixo de 70% (mínimo da IN).', PAGINA.margem, y + 7, 6.5, CINZA);

  return doc;
}

export const NOME_ARQUIVO_PDF = 'ferias-2027-gantt.pdf';
