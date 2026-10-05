# Marca Férias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web gratuito (GitHub Pages + Supabase) para os Procuradores do Núcleo de Educação da EFIN1 marcarem férias de 2027 e o recesso 2026/2027, com Gantt de choques e ocupação por setor.

**Architecture:** SPA estática em Vite + TypeScript (sem framework), com roteamento por hash (`#/`, `#/marcar`, `#/admin`). Toda a lógica de datas/regras fica em módulos puros (`src/lib`) testados com Vitest. O Supabase guarda os dados; o cliente só chama funções RPC `security definer` (RLS ligado, sem acesso direto a tabelas), que validam PIN/senha e as regras de negócio.

**Tech Stack:** Node ≥ 20, Vite, TypeScript (strict), Vitest + jsdom, @supabase/supabase-js, Supabase CLI (via npm, sem Docker), Postgres + pgcrypto, GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-05-marca-ferias-design.md`

## Global Constraints

- Ano das férias: **2027** (01/01/2027 a 31/12/2027). Teto: **30 dias corridos** somados. Sem limite de períodos.
- Recesso **não** conta nos 30 dias. Opções `natal` / `ano_novo`, datas configuráveis; padrão Natal 20/12/2026–26/12/2026, Ano-Novo 27/12/2026–02/01/2027.
- Status: `completo` ⇔ soma = 30 **e** recesso escolhido; senão `pendente`.
- Gantt: de **21/12/2026 a 31/12/2027** (376 dias). Zoom Ano (3 px/dia), Trimestre (10 px/dia), Mês (32 px/dia).
- PIN: 4–6 dígitos; bcrypt; 5 erros ⇒ bloqueio de 15 min. Sessões (Procurador e admin) valem 4 h.
- Datas sempre como string `'YYYY-MM-DD'`; **nunca** `new Date('YYYY-MM-DD')` nem métodos locais de `Date` — usar `src/lib/datas.ts` (UTC).
- Role `anon` não lê nem escreve tabelas; só executa as RPCs públicas listadas. Nenhuma resposta pública contém `pin_hash`, `admin_hash` ou tokens.
- Mensagens de erro de regras **idênticas** no TS (`src/lib/regras.ts`) e no SQL (`_salvar_ferias`).
- Todo texto de interface em português do Brasil, com acentuação correta.
- Somente planos gratuitos (Supabase Free, GitHub Pages em repositório público).
- Comandos de terminal prefixados com `rtk` (instrução global do usuário), ex.: `rtk npm test`.
- Commits terminam com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Passos marcados **[Humano]** exigem ação do usuário (contas, chaves): o executor para e pede.

## Review Focus

1. **Fuso horário (UTC−3):** datas não podem "andar" um dia no navegador do usuário — testes de `datas`/`escala` rodam com `TZ=America/Sao_Paulo` (Task 1, Task 5).
2. **Salvar duas vezes ao mesmo tempo** (clique duplo, duas abas): resultado deve ser uma das marcações, nunca a soma das duas — `for update` em `_salvar_ferias` + teste de concorrência (Task 7).
3. **Sessão vencida no meio da edição:** o servidor responde "Sessão expirada", o cliente marca `sessaoExpirada` e o editor pede o PIN preservando o rascunho — testes em Task 7 (unitário do cliente e integração).
4. **Procurador inativado:** some da seleção e da contagem do setor; sessão existente para de valer; não consegue entrar — testes em Task 3 e Task 8.
5. **Nomes com `;`, aspas ou acentos no CSV:** devem abrir corretamente no Excel (separador `;`, BOM, aspas escapadas) — teste em Task 4.

---

## Estrutura de arquivos

```
package.json, tsconfig.json, vite.config.ts, vitest.integration.config.ts, index.html
.env.example                     variáveis necessárias (sem valores)
scripts/db-push.mjs              aplica migrations no projeto test ou prod
scripts/dados-exemplo.mjs        popula o projeto de dev com dados fictícios
supabase/config.toml             gerado por `supabase init`
supabase/migrations/
  20261005000001_schema.sql      tabelas, RLS, grants
  20261005000002_seed.sql        config + feriados 2027
  20261005000003_ping_teste.sql  ping() e _teste_definir_admin()
  20261005000004_rpcs_publicas.sql  sessão, PIN, salvar férias, dados_publicos
  20261005000005_rpcs_admin.sql  RPCs do administrador
src/
  main.ts                        roteador por hash
  styles.css                     tema claro/escuro, Gantt
  vite-env.d.ts
  lib/tipos.ts                   tipos compartilhados
  lib/datas.ts                   aritmética de datas em UTC
  lib/regras.ts                  validação e status
  lib/ocupacao.ts                consultas sobre DadosPublicos (setores, ausências)
  lib/csv.ts                     exportação CSV
  lib/escala.ts                  geometria do Gantt
  lib/rotulos.ts                 rótulos de exibição
  api/rpc.ts                     criarApi(cliente) + ErroApi
  api/index.ts                   instância configurada por env
  api/sessao.ts                  token no localStorage
  ui/dom.ts                      helper h() e aviso()
  ui/gantt.ts                    renderGantt()
  ui/formFerias.ts               formulário de períodos + recesso
  ui/telaPrincipal.ts            tela pública
  ui/editor.ts                   fluxo "Marcar minhas férias"
  ui/admin.ts                    painel do administrador
tests/setup-tz.ts
tests/unit/*.test.ts, tests/unit/fixtures.ts
tests/integration/ambiente.ts, tests/integration/*.test.ts
.github/workflows/deploy.yml, .github/workflows/keep-alive.yml
README.md
```

---

### Task 1: Scaffold do projeto + módulo de datas

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `tests/setup-tz.ts`, `src/vite-env.d.ts`, `src/lib/tipos.ts`, `src/lib/datas.ts`, `.env.example`
- Modify: `.gitignore`
- Test: `tests/unit/datas.test.ts`

**Interfaces:**
- Produces (`src/lib/tipos.ts`): `DataISO`, `Recesso`, `Periodo`, `Setor`, `Procurador`, `PeriodoFerias`, `DiaEspecial`, `DatasRecesso`, `DadosPublicos` (código abaixo).
- Produces (`src/lib/datas.ts`): `ehDataValida(s: string): boolean`, `paraNumero(s: DataISO): number`, `deNumero(n: number): DataISO`, `somarDias(s: DataISO, n: number): DataISO`, `diasCorridos(p: Periodo): number`, `sobrepoe(a: Periodo, b: Periodo): boolean`, `contem(p: Periodo, dia: DataISO): boolean`, `diaDaSemana(s: DataISO): number` (0 = domingo), `formatarBR(s: DataISO): string`.

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "marca-ferias",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "db:push:test": "node scripts/db-push.mjs test",
    "db:push:prod": "node scripts/db-push.mjs prod",
    "dados:exemplo": "node scripts/dados-exemplo.mjs"
  }
}
```

- [ ] **Step 2: Instalar dependências**

Run: `rtk npm install @supabase/supabase-js` e depois `rtk npm install -D vite typescript vitest jsdom supabase @types/node`
Expected: `node_modules/` criado, `package-lock.json` gerado, sem erros.

- [ ] **Step 3: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "allowImportingTsExtensions": false
  },
  "include": ["src", "tests", "vite.config.ts", "vitest.integration.config.ts"]
}
```

- [ ] **Step 4: Criar `vite.config.ts` e `tests/setup-tz.ts`**

```ts
// vite.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup-tz.ts'],
  },
});
```

```ts
// tests/setup-tz.ts
// Simula o fuso dos usuários (UTC−3) para pegar erros de data "andando" um dia.
process.env.TZ = 'America/Sao_Paulo';
```

- [ ] **Step 5: Criar `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 6: Criar `src/lib/tipos.ts`**

```ts
/** Data no formato 'YYYY-MM-DD'. */
export type DataISO = string;

export type Recesso = 'natal' | 'ano_novo';

export interface Periodo {
  inicio: DataISO;
  fim: DataISO;
}

export interface Setor {
  id: number;
  nome: string;
  ordem: number;
}

export interface Procurador {
  id: number;
  nome: string;
  setor_id: number;
  recesso: Recesso | null;
  ativo: boolean;
  tem_pin: boolean;
}

export interface PeriodoFerias extends Periodo {
  procurador_id: number;
}

export interface DiaEspecial {
  data: DataISO;
  tipo: 'feriado' | 'facultativo';
  descricao: string;
}

export type DatasRecesso = Record<Recesso, Periodo>;

export interface DadosPublicos {
  setores: Setor[];
  procuradores: Procurador[];
  periodos: PeriodoFerias[];
  dias_especiais: DiaEspecial[];
  recesso: DatasRecesso;
}
```

- [ ] **Step 7: Escrever o teste que falha — `tests/unit/datas.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  contem, deNumero, diaDaSemana, diasCorridos, ehDataValida, formatarBR, paraNumero, sobrepoe, somarDias,
} from '../../src/lib/datas';

describe('datas', () => {
  it('roda no fuso de São Paulo', () => {
    expect(process.env.TZ).toBe('America/Sao_Paulo');
  });

  it('valida datas', () => {
    expect(ehDataValida('2027-01-31')).toBe(true);
    expect(ehDataValida('2027-02-29')).toBe(false);
    expect(ehDataValida('2028-02-29')).toBe(true);
    expect(ehDataValida('2027-13-01')).toBe(false);
    expect(ehDataValida('')).toBe(false);
    expect(ehDataValida('01/02/2027')).toBe(false);
  });

  it('converte ida e volta sem perder dia', () => {
    for (const d of ['2026-12-21', '2027-01-01', '2027-03-14', '2027-10-31', '2027-12-31']) {
      expect(deNumero(paraNumero(d))).toBe(d);
    }
  });

  it('soma dias atravessando o ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('conta dias corridos inclusive', () => {
    expect(diasCorridos({ inicio: '2027-01-01', fim: '2027-01-01' })).toBe(1);
    expect(diasCorridos({ inicio: '2027-02-20', fim: '2027-03-01' })).toBe(10);
    expect(diasCorridos({ inicio: '2027-01-01', fim: '2027-12-31' })).toBe(365);
  });

  it('detecta sobreposição nas bordas', () => {
    const a = { inicio: '2027-01-01', fim: '2027-01-10' };
    expect(sobrepoe(a, { inicio: '2027-01-10', fim: '2027-01-15' })).toBe(true);
    expect(sobrepoe(a, { inicio: '2027-01-11', fim: '2027-01-15' })).toBe(false);
    expect(sobrepoe({ inicio: '2027-01-05', fim: '2027-01-06' }, a)).toBe(true);
  });

  it('verifica se um dia está contido', () => {
    const p = { inicio: '2027-01-01', fim: '2027-01-10' };
    expect(contem(p, '2027-01-10')).toBe(true);
    expect(contem(p, '2027-01-11')).toBe(false);
  });

  it('calcula o dia da semana em UTC', () => {
    expect(diaDaSemana('2027-01-01')).toBe(5); // sexta
    expect(diaDaSemana('2027-01-03')).toBe(0); // domingo
  });

  it('formata no padrão brasileiro', () => {
    expect(formatarBR('2027-03-05')).toBe('05/03/2027');
  });
});
```

- [ ] **Step 8: Rodar e ver falhar**

Run: `rtk npm test`
Expected: FAIL — `Cannot find module '../../src/lib/datas'` (ou equivalente).

- [ ] **Step 9: Implementar `src/lib/datas.ts`**

```ts
import type { DataISO, Periodo } from './tipos';

const DIA_MS = 86_400_000;
const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

export function ehDataValida(s: string): boolean {
  if (!FORMATO.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Número de dias desde 1970-01-01 (UTC). */
export function paraNumero(s: DataISO): number {
  const [a, m, d] = s.split('-').map(Number);
  return Date.UTC(a, m - 1, d) / DIA_MS;
}

export function deNumero(n: number): DataISO {
  return new Date(n * DIA_MS).toISOString().slice(0, 10);
}

export function somarDias(s: DataISO, n: number): DataISO {
  return deNumero(paraNumero(s) + n);
}

export function diasCorridos(p: Periodo): number {
  return paraNumero(p.fim) - paraNumero(p.inicio) + 1;
}

export function sobrepoe(a: Periodo, b: Periodo): boolean {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}

export function contem(p: Periodo, dia: DataISO): boolean {
  return p.inicio <= dia && dia <= p.fim;
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(s: DataISO): number {
  return new Date(paraNumero(s) * DIA_MS).getUTCDay();
}

export function formatarBR(s: DataISO): string {
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
}
```

- [ ] **Step 10: Rodar e ver passar**

Run: `rtk npm test`
Expected: PASS (8 testes).

- [ ] **Step 11: Atualizar `.gitignore` e criar `.env.example`**

`.gitignore` (conteúdo completo):

```
.venv/
.idea/
node_modules/
dist/
.env*
!.env.example
supabase/.temp/
```

`.env.example`:

```
# .env.local — usado por `npm run dev` (aponte para o projeto Supabase de DEV)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# .env.test.local — testes de integração e dados de exemplo (projeto de DEV; será APAGADO)
SUPABASE_TEST_URL=
SUPABASE_TEST_ANON_KEY=
SUPABASE_TEST_SERVICE_KEY=
SUPABASE_TEST_DB_URL=

# .env.production.local — produção (build local e migrations)
# VITE_SUPABASE_URL=
# VITE_SUPABASE_ANON_KEY=
# SUPABASE_PROD_DB_URL=
```

- [ ] **Step 12: Verificar tipos e commitar**

Run: `rtk npx tsc --noEmit`
Expected: sem erros.

```bash
rtk git add package.json package-lock.json tsconfig.json vite.config.ts tests/setup-tz.ts tests/unit/datas.test.ts src .gitignore .env.example
rtk git commit -m "feat: scaffold Vite+TS e módulo de datas em UTC"
```

---

### Task 2: Regras de negócio (validação e status)

**Files:**
- Create: `src/lib/regras.ts`
- Test: `tests/unit/regras.test.ts`

**Interfaces:**
- Consumes: `ehDataValida`, `diasCorridos`, `sobrepoe` (Task 1); tipos `Periodo`, `Recesso`, `DatasRecesso`.
- Produces: `INICIO_ANO = '2027-01-01'`, `FIM_ANO = '2027-12-31'`, `MAX_DIAS = 30`, `periodoValido(p: Periodo): boolean`, `totalDias(periodos: Periodo[]): number` (ignora períodos inválidos), `validarMarcacao(periodos: Periodo[], recesso: Recesso | null, datas: DatasRecesso): string[]`, `type Status = 'completo' | 'pendente'`, `statusProcurador(periodos: Periodo[], recesso: Recesso | null): Status`.
- Mensagens (exatas, também usadas no SQL da Task 7): `Período N: data inválida.` · `Período N: o fim é anterior ao início.` · `Período N: deve estar dentro de 2027.` · `Soma ultrapassa 30 dias (T).` · `Períodos I e J se sobrepõem.` · `Período N sobrepõe o recesso escolhido.`

- [ ] **Step 1: Escrever o teste que falha — `tests/unit/regras.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { statusProcurador, totalDias, validarMarcacao } from '../../src/lib/regras';
import type { DatasRecesso } from '../../src/lib/tipos';

const REC: DatasRecesso = {
  natal: { inicio: '2026-12-20', fim: '2026-12-26' },
  ano_novo: { inicio: '2026-12-27', fim: '2027-01-02' },
};
const QUINZE_A = { inicio: '2027-03-01', fim: '2027-03-15' };
const QUINZE_B = { inicio: '2027-07-01', fim: '2027-07-15' };

describe('validarMarcacao', () => {
  it('aceita marcação vazia', () => {
    expect(validarMarcacao([], null, REC)).toEqual([]);
  });

  it('aceita exatamente 30 dias', () => {
    expect(validarMarcacao([QUINZE_A, QUINZE_B], 'natal', REC)).toEqual([]);
  });

  it('rejeita soma acima de 30', () => {
    expect(validarMarcacao([QUINZE_A, { inicio: '2027-07-01', fim: '2027-07-16' }], null, REC))
      .toEqual(['Soma ultrapassa 30 dias (31).']);
  });

  it('rejeita período fora de 2027', () => {
    expect(validarMarcacao([{ inicio: '2026-12-28', fim: '2027-01-05' }], null, REC))
      .toEqual(['Período 1: deve estar dentro de 2027.']);
  });

  it('rejeita fim antes do início', () => {
    expect(validarMarcacao([{ inicio: '2027-03-10', fim: '2027-03-01' }], null, REC))
      .toEqual(['Período 1: o fim é anterior ao início.']);
  });

  it('rejeita data vazia ou inexistente', () => {
    expect(validarMarcacao([QUINZE_A, { inicio: '', fim: '' }], null, REC))
      .toEqual(['Período 2: data inválida.']);
    expect(validarMarcacao([{ inicio: '2027-02-30', fim: '2027-03-01' }], null, REC))
      .toEqual(['Período 1: data inválida.']);
  });

  it('rejeita períodos sobrepostos', () => {
    expect(validarMarcacao([
      { inicio: '2027-03-01', fim: '2027-03-10' },
      { inicio: '2027-03-10', fim: '2027-03-12' },
    ], null, REC)).toEqual(['Períodos 1 e 2 se sobrepõem.']);
  });

  it('rejeita sobreposição com o recesso escolhido, e só com ele', () => {
    const p = [{ inicio: '2027-01-01', fim: '2027-01-05' }];
    expect(validarMarcacao(p, 'ano_novo', REC)).toEqual(['Período 1 sobrepõe o recesso escolhido.']);
    expect(validarMarcacao(p, 'natal', REC)).toEqual([]);
  });
});

describe('totalDias e status', () => {
  it('ignora períodos inválidos na soma', () => {
    expect(totalDias([QUINZE_A, { inicio: '', fim: '' }, { inicio: '2027-05-10', fim: '2027-05-01' }])).toBe(15);
  });

  it('completo exige 30 dias e recesso', () => {
    expect(statusProcurador([QUINZE_A, QUINZE_B], 'natal')).toBe('completo');
    expect(statusProcurador([QUINZE_A, QUINZE_B], null)).toBe('pendente');
    expect(statusProcurador([QUINZE_A], 'natal')).toBe('pendente');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npm test`
Expected: FAIL — módulo `regras` inexistente.

- [ ] **Step 3: Implementar `src/lib/regras.ts`**

```ts
import { diasCorridos, ehDataValida, sobrepoe } from './datas';
import type { DatasRecesso, Periodo, Recesso } from './tipos';

export const INICIO_ANO = '2027-01-01';
export const FIM_ANO = '2027-12-31';
export const MAX_DIAS = 30;

export type Status = 'completo' | 'pendente';

export function periodoValido(p: Periodo): boolean {
  return ehDataValida(p.inicio) && ehDataValida(p.fim) && p.fim >= p.inicio;
}

export function totalDias(periodos: Periodo[]): number {
  return periodos.filter(periodoValido).reduce((soma, p) => soma + diasCorridos(p), 0);
}

/** Mesmas regras e mensagens de `_salvar_ferias` no banco. */
export function validarMarcacao(periodos: Periodo[], recesso: Recesso | null, datas: DatasRecesso): string[] {
  const erros: string[] = [];

  periodos.forEach((p, i) => {
    const n = i + 1;
    if (!ehDataValida(p.inicio) || !ehDataValida(p.fim)) erros.push(`Período ${n}: data inválida.`);
    else if (p.fim < p.inicio) erros.push(`Período ${n}: o fim é anterior ao início.`);
    else if (p.inicio < INICIO_ANO || p.fim > FIM_ANO) erros.push(`Período ${n}: deve estar dentro de 2027.`);
  });

  const total = totalDias(periodos);
  if (total > MAX_DIAS) erros.push(`Soma ultrapassa 30 dias (${total}).`);

  for (let i = 0; i < periodos.length; i++) {
    for (let j = i + 1; j < periodos.length; j++) {
      const a = periodos[i];
      const b = periodos[j];
      if (periodoValido(a) && periodoValido(b) && sobrepoe(a, b)) erros.push(`Períodos ${i + 1} e ${j + 1} se sobrepõem.`);
    }
  }

  if (recesso) {
    periodos.forEach((p, i) => {
      if (periodoValido(p) && sobrepoe(p, datas[recesso])) erros.push(`Período ${i + 1} sobrepõe o recesso escolhido.`);
    });
  }

  return erros;
}

export function statusProcurador(periodos: Periodo[], recesso: Recesso | null): Status {
  return recesso !== null && totalDias(periodos) === MAX_DIAS ? 'completo' : 'pendente';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/regras.ts tests/unit/regras.test.ts
rtk git commit -m "feat: regras de validação e status das férias"
```

---

### Task 3: Consultas de ocupação por setor

**Files:**
- Create: `src/lib/ocupacao.ts`, `tests/unit/fixtures.ts`
- Test: `tests/unit/ocupacao.test.ts`

**Interfaces:**
- Consumes: `contem`, `sobrepoe` (Task 1); tipos.
- Produces:
  - `setoresOrdenados(d: DadosPublicos): Setor[]` — por `ordem`, depois nome.
  - `procuradoresDoSetor(d: DadosPublicos, setorId: number): Procurador[]` — **somente ativos**, por nome.
  - `periodosDe(d: DadosPublicos, procuradorId: number): PeriodoFerias[]` — por início.
  - `interface Ausencia { procurador: Procurador; motivo: 'ferias' | 'recesso' }`
  - `interface OcupacaoDia { total: number; presentes: number; ausentes: Ausencia[] }`
  - `ausenciasNoDia(d: DadosPublicos, setorId: number, dia: DataISO): OcupacaoDia`
  - `interface ColegaFora { nome: string; inicio: DataISO; fim: DataISO; motivo: 'ferias' | 'recesso' }`
  - `colegasFora(d: DadosPublicos, setorId: number, periodo: Periodo, excetoId: number): ColegaFora[]`
  - `tests/unit/fixtures.ts`: `RECESSO: DatasRecesso`, `dadosExemplo(): DadosPublicos` (reutilizado nas Tasks 4 e 9).

- [ ] **Step 1: Criar `tests/unit/fixtures.ts`**

```ts
import type { DadosPublicos, DatasRecesso } from '../../src/lib/tipos';

export const RECESSO: DatasRecesso = {
  natal: { inicio: '2026-12-20', fim: '2026-12-26' },
  ano_novo: { inicio: '2026-12-27', fim: '2027-01-02' },
};

/** Setor 1 "Contencioso" (ordem 2): Ana, Bruno, Carla (inativa). Setor 2 "Consultivo" (ordem 1): Davi. */
export function dadosExemplo(): DadosPublicos {
  return {
    setores: [
      { id: 1, nome: 'Contencioso', ordem: 2 },
      { id: 2, nome: 'Consultivo', ordem: 1 },
    ],
    procuradores: [
      { id: 10, nome: 'Ana', setor_id: 1, recesso: 'natal', ativo: true, tem_pin: true },
      { id: 11, nome: 'Bruno', setor_id: 1, recesso: 'ano_novo', ativo: true, tem_pin: false },
      { id: 12, nome: 'Carla', setor_id: 1, recesso: null, ativo: false, tem_pin: false },
      { id: 13, nome: 'Davi', setor_id: 2, recesso: null, ativo: true, tem_pin: false },
    ],
    periodos: [
      { procurador_id: 10, inicio: '2027-03-01', fim: '2027-03-10' },
      { procurador_id: 11, inicio: '2027-03-05', fim: '2027-03-06' },
      { procurador_id: 12, inicio: '2027-03-01', fim: '2027-03-31' },
    ],
    dias_especiais: [{ data: '2027-01-01', tipo: 'feriado', descricao: 'Confraternização Universal' }],
    recesso: RECESSO,
  };
}
```

- [ ] **Step 2: Escrever o teste que falha — `tests/unit/ocupacao.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import {
  ausenciasNoDia, colegasFora, periodosDe, procuradoresDoSetor, setoresOrdenados,
} from '../../src/lib/ocupacao';
import { dadosExemplo } from './fixtures';

const d = dadosExemplo();

describe('ocupação', () => {
  it('ordena setores por ordem', () => {
    expect(setoresOrdenados(d).map(s => s.nome)).toEqual(['Consultivo', 'Contencioso']);
  });

  it('lista só procuradores ativos do setor, por nome', () => {
    expect(procuradoresDoSetor(d, 1).map(p => p.nome)).toEqual(['Ana', 'Bruno']);
  });

  it('retorna períodos de um procurador', () => {
    expect(periodosDe(d, 10)).toEqual([{ procurador_id: 10, inicio: '2027-03-01', fim: '2027-03-10' }]);
  });

  it('conta ausentes por férias e ignora inativos', () => {
    const o = ausenciasNoDia(d, 1, '2027-03-05');
    expect(o.total).toBe(2);
    expect(o.presentes).toBe(0);
    expect(o.ausentes.map(a => [a.procurador.nome, a.motivo])).toEqual([['Ana', 'ferias'], ['Bruno', 'ferias']]);
  });

  it('todos presentes fora das férias', () => {
    expect(ausenciasNoDia(d, 1, '2027-03-11').presentes).toBe(2);
  });

  it('conta recesso escolhido como ausência', () => {
    expect(ausenciasNoDia(d, 1, '2026-12-22').ausentes.map(a => [a.procurador.nome, a.motivo])).toEqual([['Ana', 'recesso']]);
    expect(ausenciasNoDia(d, 1, '2027-01-01').ausentes.map(a => a.procurador.nome)).toEqual(['Bruno']);
  });

  it('lista colegas fora no período, exceto a própria pessoa e inativos', () => {
    expect(colegasFora(d, 1, { inicio: '2027-03-04', fim: '2027-03-05' }, 10)).toEqual([
      { nome: 'Bruno', inicio: '2027-03-05', fim: '2027-03-06', motivo: 'ferias' },
    ]);
    expect(colegasFora(d, 1, { inicio: '2026-12-21', fim: '2026-12-21' }, 11)).toEqual([
      { nome: 'Ana', inicio: '2026-12-20', fim: '2026-12-26', motivo: 'recesso' },
    ]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `rtk npm test`
Expected: FAIL — módulo `ocupacao` inexistente.

- [ ] **Step 4: Implementar `src/lib/ocupacao.ts`**

```ts
import { contem, sobrepoe } from './datas';
import type { DadosPublicos, DataISO, Periodo, PeriodoFerias, Procurador, Setor } from './tipos';

export interface Ausencia {
  procurador: Procurador;
  motivo: 'ferias' | 'recesso';
}

export interface OcupacaoDia {
  total: number;
  presentes: number;
  ausentes: Ausencia[];
}

export interface ColegaFora {
  nome: string;
  inicio: DataISO;
  fim: DataISO;
  motivo: 'ferias' | 'recesso';
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR');

export function setoresOrdenados(d: DadosPublicos): Setor[] {
  return [...d.setores].sort((a, b) => a.ordem - b.ordem || porNome(a, b));
}

export function procuradoresDoSetor(d: DadosPublicos, setorId: number): Procurador[] {
  return d.procuradores.filter(p => p.ativo && p.setor_id === setorId).sort(porNome);
}

export function periodosDe(d: DadosPublicos, procuradorId: number): PeriodoFerias[] {
  return d.periodos.filter(p => p.procurador_id === procuradorId).sort((a, b) => a.inicio.localeCompare(b.inicio));
}

export function ausenciasNoDia(d: DadosPublicos, setorId: number, dia: DataISO): OcupacaoDia {
  const procs = procuradoresDoSetor(d, setorId);
  const ausentes: Ausencia[] = [];
  for (const p of procs) {
    if (d.periodos.some(x => x.procurador_id === p.id && contem(x, dia))) ausentes.push({ procurador: p, motivo: 'ferias' });
    else if (p.recesso && contem(d.recesso[p.recesso], dia)) ausentes.push({ procurador: p, motivo: 'recesso' });
  }
  return { total: procs.length, presentes: procs.length - ausentes.length, ausentes };
}

export function colegasFora(d: DadosPublicos, setorId: number, periodo: Periodo, excetoId: number): ColegaFora[] {
  const r: ColegaFora[] = [];
  for (const p of procuradoresDoSetor(d, setorId)) {
    if (p.id === excetoId) continue;
    for (const x of periodosDe(d, p.id)) {
      if (sobrepoe(x, periodo)) r.push({ nome: p.nome, inicio: x.inicio, fim: x.fim, motivo: 'ferias' });
    }
    if (p.recesso) {
      const rec = d.recesso[p.recesso];
      if (sobrepoe(rec, periodo)) r.push({ nome: p.nome, inicio: rec.inicio, fim: rec.fim, motivo: 'recesso' });
    }
  }
  return r.sort((a, b) => a.inicio.localeCompare(b.inicio) || porNome(a, b));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `rtk npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/ocupacao.ts tests/unit/fixtures.ts tests/unit/ocupacao.test.ts
rtk git commit -m "feat: cálculo de ocupação por setor e colegas fora"
```

---

### Task 4: Exportação CSV e rótulos

**Files:**
- Create: `src/lib/rotulos.ts`, `src/lib/csv.ts`
- Test: `tests/unit/csv.test.ts`

**Interfaces:**
- Consumes: `setoresOrdenados`, `procuradoresDoSetor`, `periodosDe` (Task 3); `statusProcurador` (Task 2); `formatarBR`, `diasCorridos` (Task 1).
- Produces: `ROTULO_RECESSO: Record<Recesso, string>` (`Natal`, `Ano-Novo`); `gerarCsv(d: DadosPublicos): string` — separador `;`, quebras `\r\n`, sem BOM (o BOM é adicionado no download, Task 11). Uma linha por período; Procurador ativo sem períodos ganha uma linha com datas vazias; inativos não entram.

- [ ] **Step 1: Escrever o teste que falha — `tests/unit/csv.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { gerarCsv } from '../../src/lib/csv';
import { dadosExemplo } from './fixtures';

describe('gerarCsv', () => {
  it('gera uma linha por período, ordenado por setor e nome', () => {
    expect(gerarCsv(dadosExemplo())).toBe([
      'Setor;Nome;Início;Fim;Dias;Recesso;Status',
      'Consultivo;Davi;;;;;pendente',
      'Contencioso;Ana;01/03/2027;10/03/2027;10;Natal;pendente',
      'Contencioso;Bruno;05/03/2027;06/03/2027;2;Ano-Novo;pendente',
      '',
    ].join('\r\n'));
  });

  it('escapa ponto e vírgula e aspas, preservando acentos', () => {
    const d = dadosExemplo();
    d.setores[1].nome = 'Jurídico; "Especial"';
    const linhas = gerarCsv(d).split('\r\n');
    expect(linhas[1]).toBe('"Jurídico; ""Especial""";Davi;;;;;pendente');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npm test`
Expected: FAIL — módulo `csv` inexistente.

- [ ] **Step 3: Implementar `src/lib/rotulos.ts` e `src/lib/csv.ts`**

```ts
// src/lib/rotulos.ts
import type { Recesso } from './tipos';

export const ROTULO_RECESSO: Record<Recesso, string> = {
  natal: 'Natal',
  ano_novo: 'Ano-Novo',
};
```

```ts
// src/lib/csv.ts
import { diasCorridos, formatarBR } from './datas';
import { periodosDe, procuradoresDoSetor, setoresOrdenados } from './ocupacao';
import { statusProcurador } from './regras';
import { ROTULO_RECESSO } from './rotulos';
import type { DadosPublicos } from './tipos';

function campo(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function gerarCsv(d: DadosPublicos): string {
  const linhas: string[][] = [['Setor', 'Nome', 'Início', 'Fim', 'Dias', 'Recesso', 'Status']];
  for (const s of setoresOrdenados(d)) {
    for (const p of procuradoresDoSetor(d, s.id)) {
      const periodos = periodosDe(d, p.id);
      const recesso = p.recesso ? ROTULO_RECESSO[p.recesso] : '';
      const status = statusProcurador(periodos, p.recesso);
      if (periodos.length === 0) linhas.push([s.nome, p.nome, '', '', '', recesso, status]);
      for (const x of periodos) {
        linhas.push([s.nome, p.nome, formatarBR(x.inicio), formatarBR(x.fim), String(diasCorridos(x)), recesso, status]);
      }
    }
  }
  return linhas.map(l => l.map(campo).join(';')).join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/rotulos.ts src/lib/csv.ts tests/unit/csv.test.ts
rtk git commit -m "feat: exportação CSV compatível com Excel"
```

---

### Task 5: Geometria do Gantt

**Files:**
- Create: `src/lib/escala.ts`
- Test: `tests/unit/escala.test.ts`

**Interfaces:**
- Consumes: `paraNumero`, `deNumero` (Task 1).
- Produces: `INICIO_GANTT = '2026-12-21'`, `FIM_GANTT = '2027-12-31'`, `type Zoom = 'ano' | 'trimestre' | 'mes'`, `PX_POR_DIA: Record<Zoom, number>` (3/10/32), `ROTULO_ZOOM: Record<Zoom, string>`, `totalDiasGantt(): number` (376), `indiceDia(dia: DataISO): number`, `geometria(p: Periodo, zoom: Zoom): { left: number; width: number } | null` (recorta ao intervalo; `null` se fora), `interface SegmentoMes { rotulo: string; inicio: number; dias: number }`, `meses(): SegmentoMes[]`.

- [ ] **Step 1: Escrever o teste que falha — `tests/unit/escala.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { geometria, indiceDia, meses, totalDiasGantt } from '../../src/lib/escala';

describe('escala do Gantt', () => {
  it('cobre 21/12/2026 a 31/12/2027', () => {
    expect(totalDiasGantt()).toBe(376);
    expect(indiceDia('2026-12-21')).toBe(0);
    expect(indiceDia('2027-01-01')).toBe(11);
    expect(indiceDia('2027-03-01')).toBe(70);
  });

  it('posiciona barras conforme o zoom', () => {
    expect(geometria({ inicio: '2027-01-01', fim: '2027-01-10' }, 'trimestre')).toEqual({ left: 110, width: 100 });
    expect(geometria({ inicio: '2027-01-01', fim: '2027-01-01' }, 'mes')).toEqual({ left: 352, width: 32 });
  });

  it('recorta períodos que começam antes do intervalo', () => {
    expect(geometria({ inicio: '2026-12-20', fim: '2026-12-26' }, 'trimestre')).toEqual({ left: 0, width: 60 });
  });

  it('retorna null para períodos fora do intervalo', () => {
    expect(geometria({ inicio: '2026-12-01', fim: '2026-12-10' }, 'ano')).toBeNull();
  });

  it('segmenta os meses', () => {
    const m = meses();
    expect(m).toHaveLength(13);
    expect(m[0]).toEqual({ rotulo: 'Dez/26', inicio: 0, dias: 11 });
    expect(m[1]).toEqual({ rotulo: 'Jan/27', inicio: 11, dias: 31 });
    expect(m[2]).toEqual({ rotulo: 'Fev/27', inicio: 42, dias: 28 });
    expect(m.reduce((s, x) => s + x.dias, 0)).toBe(376);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npm test`
Expected: FAIL — módulo `escala` inexistente.

- [ ] **Step 3: Implementar `src/lib/escala.ts`**

```ts
import { deNumero, paraNumero } from './datas';
import type { DataISO, Periodo } from './tipos';

export const INICIO_GANTT = '2026-12-21';
export const FIM_GANTT = '2027-12-31';

export type Zoom = 'ano' | 'trimestre' | 'mes';

export const PX_POR_DIA: Record<Zoom, number> = { ano: 3, trimestre: 10, mes: 32 };
export const ROTULO_ZOOM: Record<Zoom, string> = { ano: 'Ano', trimestre: 'Trimestre', mes: 'Mês' };

const BASE = paraNumero(INICIO_GANTT);
const NOMES_MES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export interface SegmentoMes {
  rotulo: string;
  inicio: number;
  dias: number;
}

export function totalDiasGantt(): number {
  return paraNumero(FIM_GANTT) - BASE + 1;
}

export function indiceDia(dia: DataISO): number {
  return paraNumero(dia) - BASE;
}

export function geometria(p: Periodo, zoom: Zoom): { left: number; width: number } | null {
  const ini = Math.max(indiceDia(p.inicio), 0);
  const fim = Math.min(indiceDia(p.fim), totalDiasGantt() - 1);
  if (fim < ini) return null;
  const px = PX_POR_DIA[zoom];
  return { left: ini * px, width: (fim - ini + 1) * px };
}

export function meses(): SegmentoMes[] {
  const r: SegmentoMes[] = [];
  const total = totalDiasGantt();
  let i = 0;
  while (i < total) {
    const [a, m] = deNumero(BASE + i).split('-').map(Number);
    const proximo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
    const dias = Math.min(paraNumero(proximo) - (BASE + i), total - i);
    r.push({ rotulo: `${NOMES_MES[m - 1]}/${String(a).slice(2)}`, inicio: i, dias });
    i += dias;
  }
  return r;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/escala.ts tests/unit/escala.test.ts
rtk git commit -m "feat: geometria do Gantt (escala e meses)"
```

---
### Task 6: Banco — schema, seed, ping e ambiente de testes de integração

**Files:**
- Create: `supabase/migrations/20261005000001_schema.sql`, `supabase/migrations/20261005000002_seed.sql`, `supabase/migrations/20261005000003_ping_teste.sql`, `scripts/db-push.mjs`, `vitest.integration.config.ts`, `tests/integration/ambiente.ts`
- Create (gerado): `supabase/config.toml`
- Test: `tests/integration/acesso.test.ts`

**Interfaces:**
- Produces (SQL): tabelas `setores`, `procuradores`, `periodos_ferias`, `dias_especiais`, `config`, `sessoes` (colunas exatas abaixo); RPC pública `ping() returns text` (`'pong'`); RPC só para `service_role` `_teste_definir_admin(p_senha text) returns void`.
- Produces (TS, `tests/integration/ambiente.ts`): `servico: SupabaseClient` (service role), `publico: SupabaseClient` (anon), `SENHA_ADMIN = 'senha-admin-teste'`, `interface Ids { setorA: number; setorB: number; ana: number; bruno: number; inativo: number }`, `resetar(): Promise<Ids>`.

- [ ] **Step 1: [Humano] Criar o projeto Supabase de DEV**

Peça ao usuário:
1. Criar conta em https://supabase.com (grátis) e um projeto chamado `marca-ferias-dev` (região São Paulo, senha do banco anotada).
2. Em *Project Settings → API*: copiar **Project URL**, chave **anon/publishable** e chave **service_role/secret**.
3. Em *Connect → Session pooler*: copiar a connection string (`postgresql://postgres.<ref>:<SENHA>@...pooler.supabase.com:5432/postgres`), com a senha **URL-encoded** se tiver caracteres especiais.
4. Criar `.env.test.local` (não versionado) com `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_SERVICE_KEY`, `SUPABASE_TEST_DB_URL`, e `.env.local` com `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` do **mesmo** projeto de dev.

Avise: **o projeto de dev é apagado a cada execução dos testes de integração.**

- [ ] **Step 2: Inicializar a pasta do Supabase CLI**

Run: `rtk npx supabase init` (responda "N" se perguntar sobre configurações de IDE)
Expected: cria `supabase/config.toml`.

- [ ] **Step 3: Criar `scripts/db-push.mjs`**

```js
// Aplica as migrations de supabase/migrations no projeto de teste ou de produção, sem Docker.
import { execSync } from 'node:child_process';
import { loadEnv } from 'vite';

const alvo = process.argv[2];
if (alvo !== 'test' && alvo !== 'prod') {
  console.error('Uso: node scripts/db-push.mjs test|prod');
  process.exit(1);
}
const env = loadEnv(alvo === 'prod' ? 'production' : 'test', process.cwd(), '');
const url = alvo === 'prod' ? env.SUPABASE_PROD_DB_URL : env.SUPABASE_TEST_DB_URL;
if (!url) {
  console.error(`Defina ${alvo === 'prod' ? 'SUPABASE_PROD_DB_URL em .env.production.local' : 'SUPABASE_TEST_DB_URL em .env.test.local'}.`);
  process.exit(1);
}
execSync(`npx supabase db push --db-url "${url}" --yes`, { stdio: 'inherit' });
```

- [ ] **Step 4: Criar `vitest.integration.config.ts`**

```ts
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    env: loadEnv('test', process.cwd(), ''),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 5: Criar `tests/integration/ambiente.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_KEY;
if (!url || !anon || !service) {
  throw new Error('Defina SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY e SUPABASE_TEST_SERVICE_KEY em .env.test.local');
}
const urlProducao = loadEnv('production', process.cwd(), '').VITE_SUPABASE_URL;
if (urlProducao && urlProducao === url) {
  throw new Error('SUPABASE_TEST_URL aponta para o projeto de PRODUÇÃO — abortando para não apagar dados reais.');
}

export const SENHA_ADMIN = 'senha-admin-teste';
export const servico = createClient(url, service, { auth: { persistSession: false } });
export const publico = createClient(url, anon, { auth: { persistSession: false } });

export interface Ids {
  setorA: number;
  setorB: number;
  ana: number;
  bruno: number;
  inativo: number;
}

async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

/** Apaga tudo no projeto de teste e recria um cenário mínimo. */
export async function resetar(): Promise<Ids> {
  await ok(servico.from('sessoes').delete().neq('token', ''));
  await ok(servico.from('periodos_ferias').delete().gte('id', 0));
  await ok(servico.from('procuradores').delete().gte('id', 0));
  await ok(servico.from('setores').delete().gte('id', 0));
  await ok(servico.from('dias_especiais').delete().gte('data', '1900-01-01'));
  await ok(servico.from('config').update({
    recesso_natal_inicio: '2026-12-20',
    recesso_natal_fim: '2026-12-26',
    recesso_ano_novo_inicio: '2026-12-27',
    recesso_ano_novo_fim: '2027-01-02',
  }).eq('id', true));
  await ok(servico.rpc('_teste_definir_admin', { p_senha: SENHA_ADMIN }));

  const setores = await ok(servico.from('setores').insert([
    { nome: 'Setor A', ordem: 1 },
    { nome: 'Setor B', ordem: 2 },
  ]).select('id, nome'));
  const setorA = setores!.find(s => s.nome === 'Setor A')!.id as number;
  const setorB = setores!.find(s => s.nome === 'Setor B')!.id as number;

  const procs = await ok(servico.from('procuradores').insert([
    { nome: 'Ana', setor_id: setorA },
    { nome: 'Bruno', setor_id: setorA },
    { nome: 'Inativo', setor_id: setorA, ativo: false },
  ]).select('id, nome'));
  const id = (nome: string) => procs!.find(p => p.nome === nome)!.id as number;

  return { setorA, setorB, ana: id('Ana'), bruno: id('Bruno'), inativo: id('Inativo') };
}
```

- [ ] **Step 6: Escrever o teste que falha — `tests/integration/acesso.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { publico, resetar } from './ambiente';

beforeEach(async () => { await resetar(); });

describe('acesso público ao banco', () => {
  it('ping responde', async () => {
    const { data, error } = await publico.rpc('ping');
    expect(error).toBeNull();
    expect(data).toBe('pong');
  });

  it('anon não lê tabelas diretamente', async () => {
    for (const tabela of ['setores', 'procuradores', 'periodos_ferias', 'dias_especiais', 'config', 'sessoes']) {
      const { data, error } = await publico.from(tabela).select('*');
      expect(error !== null || (data ?? []).length === 0, tabela).toBe(true);
    }
  });

  it('anon não escreve tabelas diretamente', async () => {
    const { error } = await publico.from('setores').insert({ nome: 'Invasor', ordem: 9 });
    expect(error).not.toBeNull();
  });

  it('anon não executa a função de teste', async () => {
    const { error } = await publico.rpc('_teste_definir_admin', { p_senha: 'x' });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `rtk npm run test:integration`
Expected: FAIL — erros do tipo `relation "public.sessoes" does not exist` no `resetar()`.

- [ ] **Step 8: Criar `supabase/migrations/20261005000001_schema.sql`**

```sql
create extension if not exists pgcrypto with schema extensions;

create table setores (
  id bigint generated always as identity primary key,
  nome text not null unique check (length(trim(nome)) > 0),
  ordem int not null default 0
);

create table procuradores (
  id bigint generated always as identity primary key,
  nome text not null unique check (length(trim(nome)) > 0),
  setor_id bigint not null references setores(id) on delete restrict,
  pin_hash text,
  recesso text check (recesso in ('natal', 'ano_novo')),
  ativo boolean not null default true,
  tentativas_falhas int not null default 0,
  bloqueado_ate timestamptz
);

create table periodos_ferias (
  id bigint generated always as identity primary key,
  procurador_id bigint not null references procuradores(id) on delete cascade,
  inicio date not null,
  fim date not null,
  check (fim >= inicio)
);
create index periodos_ferias_procurador_idx on periodos_ferias (procurador_id);

create table dias_especiais (
  data date primary key,
  tipo text not null check (tipo in ('feriado', 'facultativo')),
  descricao text not null
);

-- Linha única (id = true).
create table config (
  id boolean primary key default true check (id),
  admin_hash text,
  recesso_natal_inicio date not null,
  recesso_natal_fim date not null,
  recesso_ano_novo_inicio date not null,
  recesso_ano_novo_fim date not null,
  check (recesso_natal_fim >= recesso_natal_inicio and recesso_ano_novo_fim >= recesso_ano_novo_inicio)
);

create table sessoes (
  token text primary key,
  procurador_id bigint references procuradores(id) on delete cascade,
  admin boolean not null default false,
  expira_em timestamptz not null,
  check (admin or procurador_id is not null)
);

-- RLS ligado e sem policies: anon/authenticated não acessam nada diretamente.
alter table setores enable row level security;
alter table procuradores enable row level security;
alter table periodos_ferias enable row level security;
alter table dias_especiais enable row level security;
alter table config enable row level security;
alter table sessoes enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
```

- [ ] **Step 9: Criar `supabase/migrations/20261005000002_seed.sql`**

```sql
insert into config (recesso_natal_inicio, recesso_natal_fim, recesso_ano_novo_inicio, recesso_ano_novo_fim)
values ('2026-12-20', '2026-12-26', '2026-12-27', '2027-01-02')
on conflict (id) do nothing;

-- Feriados nacionais de 2027. Pontos facultativos (Carnaval, Corpus Christi etc.) são cadastrados pelo admin.
insert into dias_especiais (data, tipo, descricao) values
  ('2027-01-01', 'feriado', 'Confraternização Universal'),
  ('2027-03-26', 'feriado', 'Sexta-feira Santa'),
  ('2027-04-21', 'feriado', 'Tiradentes'),
  ('2027-05-01', 'feriado', 'Dia do Trabalho'),
  ('2027-09-07', 'feriado', 'Independência do Brasil'),
  ('2027-10-12', 'feriado', 'Nossa Senhora Aparecida'),
  ('2027-11-02', 'feriado', 'Finados'),
  ('2027-11-15', 'feriado', 'Proclamação da República'),
  ('2027-11-20', 'feriado', 'Dia Nacional de Zumbi e da Consciência Negra'),
  ('2027-12-25', 'feriado', 'Natal')
on conflict (data) do nothing;
```

- [ ] **Step 10: Criar `supabase/migrations/20261005000003_ping_teste.sql`**

```sql
create or replace function ping() returns text
language sql stable as $$ select 'pong'::text $$;

-- Usada só pelos testes de integração (service_role) para definir a senha admin.
create or replace function _teste_definir_admin(p_senha text) returns void
language sql security definer set search_path = public, extensions as $$
  update config set admin_hash = crypt(p_senha, gen_salt('bf')) where id;
$$;

revoke execute on function ping() from public, anon, authenticated;
grant execute on function ping() to anon, authenticated;

revoke execute on function _teste_definir_admin(text) from public, anon, authenticated;
grant execute on function _teste_definir_admin(text) to service_role;
```

- [ ] **Step 11: Aplicar as migrations no projeto de dev**

Run: `rtk npm run db:push:test`
Expected: lista as 3 migrations e termina com `Finished supabase db push.`

- [ ] **Step 12: Rodar e ver passar**

Run: `rtk npm run test:integration`
Expected: PASS (4 testes).

- [ ] **Step 13: Commit**

```bash
rtk git add supabase scripts/db-push.mjs vitest.integration.config.ts tests/integration
rtk git commit -m "feat: schema do banco, feriados 2027 e ambiente de integração"
```

---

### Task 7: RPCs públicas (PIN, sessão, salvar férias) + cliente da API

**Files:**
- Create: `supabase/migrations/20261005000004_rpcs_publicas.sql`, `src/api/rpc.ts`
- Test: `tests/unit/rpc.test.ts`, `tests/integration/procurador.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 6; tipos da Task 1.
- Produces (SQL, internas — sem grant para anon): `_novo_token(p_procurador_id bigint, p_admin boolean) returns text`, `_procurador_da_sessao(p_token text) returns bigint`, `_exigir_admin(p_token text) returns void`, `_salvar_ferias(p_procurador_id bigint, p_periodos jsonb, p_recesso text) returns void`.
- Produces (SQL, públicas): `dados_publicos() returns jsonb` (formato de `DadosPublicos`), `definir_pin(p_procurador_id bigint, p_pin text) returns jsonb`, `entrar(p_procurador_id bigint, p_pin text) returns jsonb` (ambas `{ok, token?, erro?}`), `salvar_minhas_ferias(p_token text, p_periodos jsonb, p_recesso text) returns void`, `sair(p_token text) returns void`.
- Produces (TS, `src/api/rpc.ts`): `class ErroApi extends Error { readonly sessaoExpirada: boolean }`, `MSG_CONEXAO`, `mensagemDe(err: unknown): string`, `interface ClienteRpc`, `criarApi(cliente: ClienteRpc)` retornando `{ ping, dadosPublicos, definirPin, entrar, salvarMinhasFerias, sair, adminEntrar, adminSalvarSetor, adminExcluirSetor, adminSalvarProcurador, adminExcluirProcurador, adminResetarPin, adminSalvarDiaEspecial, adminExcluirDiaEspecial, adminSalvarRecesso, adminSalvarFerias, adminTrocarSenha }`, `type Api = ReturnType<typeof criarApi>`. Os métodos `admin*` só passam a funcionar no servidor na Task 8, mas o cliente é escrito inteiro aqui (assinaturas abaixo).

- [ ] **Step 1: Escrever o teste unitário que falha — `tests/unit/rpc.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { criarApi, MSG_CONEXAO, type ClienteRpc, type RespostaRpc } from '../../src/api/rpc';

function falso(resposta: RespostaRpc) {
  const chamadas: [string, Record<string, unknown> | undefined][] = [];
  const cliente: ClienteRpc = {
    rpc: async (nome, args) => { chamadas.push([nome, args]); return resposta; },
  };
  return { api: criarApi(cliente), chamadas };
}

describe('cliente RPC', () => {
  it('erro sem código vira mensagem de conexão', async () => {
    const { api } = falso({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    await expect(api.dadosPublicos()).rejects.toThrow(MSG_CONEXAO);
  });

  it('exceção do cliente vira mensagem de conexão', async () => {
    const api = criarApi({ rpc: async () => { throw new Error('rede caiu'); } });
    await expect(api.ping()).rejects.toThrow(MSG_CONEXAO);
  });

  it('marca sessão expirada', async () => {
    const { api } = falso({ data: null, error: { message: 'Sessão expirada. Entre novamente.', code: 'P0001' } });
    await expect(api.salvarMinhasFerias('t', [], null)).rejects.toMatchObject({ sessaoExpirada: true });
  });

  it('repassa mensagem de regra do servidor', async () => {
    const { api } = falso({ data: null, error: { message: 'Soma ultrapassa 30 dias (31).', code: 'P0001' } });
    await expect(api.salvarMinhasFerias('t', [], null)).rejects.toMatchObject({
      message: 'Soma ultrapassa 30 dias (31).', sessaoExpirada: false,
    });
  });

  it('login com ok=false lança a mensagem do servidor', async () => {
    const { api } = falso({ data: { ok: false, erro: 'PIN incorreto — 4 tentativa(s) restante(s).' }, error: null });
    await expect(api.entrar(1, '0000')).rejects.toThrow('PIN incorreto — 4 tentativa(s) restante(s).');
  });

  it('login com ok=true devolve o token', async () => {
    const { api } = falso({ data: { ok: true, token: 'abc' }, error: null });
    await expect(api.definirPin(1, '1234')).resolves.toBe('abc');
  });

  it('envia apenas início e fim dos períodos', async () => {
    const { api, chamadas } = falso({ data: null, error: null });
    await api.salvarMinhasFerias('t', [{ inicio: '2027-01-04', fim: '2027-01-08', procurador_id: 9 } as never], 'natal');
    expect(chamadas[0]).toEqual(['salvar_minhas_ferias', {
      p_token: 't', p_periodos: [{ inicio: '2027-01-04', fim: '2027-01-08' }], p_recesso: 'natal',
    }]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npm test`
Expected: FAIL — módulo `src/api/rpc` inexistente.

- [ ] **Step 3: Implementar `src/api/rpc.ts`**

```ts
import type { DadosPublicos, DatasRecesso, DiaEspecial, Periodo, Recesso } from '../lib/tipos';

export const MSG_CONEXAO = 'Não foi possível conectar; tente novamente em instantes.';

export class ErroApi extends Error {
  constructor(mensagem: string, readonly sessaoExpirada = false) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export function mensagemDe(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro inesperado.';
}

export interface RespostaRpc {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** Subconjunto do SupabaseClient usado pelo app (facilita testes com cliente falso). */
export interface ClienteRpc {
  rpc(nome: string, args?: Record<string, unknown>): PromiseLike<RespostaRpc>;
}

interface RespostaLogin {
  ok: boolean;
  token?: string;
  erro?: string;
}

const soDatas = (periodos: Periodo[]) => periodos.map(({ inicio, fim }) => ({ inicio, fim }));

export function criarApi(cliente: ClienteRpc) {
  async function chamar<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
    let resposta: RespostaRpc;
    try {
      resposta = await cliente.rpc(nome, args);
    } catch {
      throw new ErroApi(MSG_CONEXAO);
    }
    const { data, error } = resposta;
    if (error) {
      // Erros do Postgres sempre têm código; sem código = falha de rede/fetch.
      if (!error.code) throw new ErroApi(MSG_CONEXAO);
      throw new ErroApi(error.message, error.message.startsWith('Sessão expirada'));
    }
    return data as T;
  }

  async function login(nome: string, args: Record<string, unknown>): Promise<string> {
    const r = await chamar<RespostaLogin>(nome, args);
    if (!r.ok || !r.token) throw new ErroApi(r.erro ?? 'Falha ao entrar.');
    return r.token;
  }

  return {
    ping: () => chamar<string>('ping'),
    dadosPublicos: () => chamar<DadosPublicos>('dados_publicos'),
    definirPin: (procuradorId: number, pin: string) =>
      login('definir_pin', { p_procurador_id: procuradorId, p_pin: pin }),
    entrar: (procuradorId: number, pin: string) =>
      login('entrar', { p_procurador_id: procuradorId, p_pin: pin }),
    salvarMinhasFerias: (token: string, periodos: Periodo[], recesso: Recesso | null) =>
      chamar<null>('salvar_minhas_ferias', { p_token: token, p_periodos: soDatas(periodos), p_recesso: recesso }),
    sair: (token: string) => chamar<null>('sair', { p_token: token }),

    adminEntrar: (senha: string) => login('admin_entrar', { p_senha: senha }),
    adminSalvarSetor: (token: string, id: number | null, nome: string, ordem: number) =>
      chamar<number>('admin_salvar_setor', { p_token: token, p_id: id, p_nome: nome, p_ordem: ordem }),
    adminExcluirSetor: (token: string, id: number) =>
      chamar<null>('admin_excluir_setor', { p_token: token, p_id: id }),
    adminSalvarProcurador: (token: string, id: number | null, nome: string, setorId: number | null, ativo: boolean) =>
      chamar<number>('admin_salvar_procurador', { p_token: token, p_id: id, p_nome: nome, p_setor_id: setorId, p_ativo: ativo }),
    adminExcluirProcurador: (token: string, id: number) =>
      chamar<null>('admin_excluir_procurador', { p_token: token, p_id: id }),
    adminResetarPin: (token: string, procuradorId: number) =>
      chamar<null>('admin_resetar_pin', { p_token: token, p_procurador_id: procuradorId }),
    adminSalvarDiaEspecial: (token: string, dia: DiaEspecial) =>
      chamar<null>('admin_salvar_dia_especial', { p_token: token, p_data: dia.data, p_tipo: dia.tipo, p_descricao: dia.descricao }),
    adminExcluirDiaEspecial: (token: string, data: string) =>
      chamar<null>('admin_excluir_dia_especial', { p_token: token, p_data: data }),
    adminSalvarRecesso: (token: string, datas: DatasRecesso) =>
      chamar<null>('admin_salvar_recesso', {
        p_token: token,
        p_natal_inicio: datas.natal.inicio, p_natal_fim: datas.natal.fim,
        p_ano_novo_inicio: datas.ano_novo.inicio, p_ano_novo_fim: datas.ano_novo.fim,
      }),
    adminSalvarFerias: (token: string, procuradorId: number, periodos: Periodo[], recesso: Recesso | null) =>
      chamar<null>('admin_salvar_ferias', { p_token: token, p_procurador_id: procuradorId, p_periodos: soDatas(periodos), p_recesso: recesso }),
    adminTrocarSenha: (token: string, atual: string, nova: string) =>
      chamar<null>('admin_trocar_senha', { p_token: token, p_senha_atual: atual, p_nova: nova }),
  };
}

export type Api = ReturnType<typeof criarApi>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk npm test`
Expected: PASS.

- [ ] **Step 5: Escrever o teste de integração que falha — `tests/integration/procurador.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { criarApi, type ClienteRpc } from '../../src/api/rpc';
import type { Periodo } from '../../src/lib/tipos';
import { publico, resetar, servico, type Ids } from './ambiente';

const api = criarApi(publico as unknown as ClienteRpc);
let ids: Ids;
beforeEach(async () => { ids = await resetar(); });

async function periodosDe(id: number): Promise<Periodo[]> {
  const d = await api.dadosPublicos();
  return d.periodos.filter(p => p.procurador_id === id).map(({ inicio, fim }) => ({ inicio, fim }));
}

describe('dados_publicos', () => {
  it('não expõe hashes nem tokens', async () => {
    const token = await api.definirPin(ids.ana, '1234');
    const dados = await api.dadosPublicos();
    const json = JSON.stringify(dados);
    expect(json).not.toContain('pin_hash');
    expect(json).not.toContain('admin_hash');
    expect(json).not.toContain('$2');
    expect(json).not.toContain(token);
    expect(dados.procuradores.find(p => p.id === ids.ana)?.tem_pin).toBe(true);
    expect(dados.recesso.natal).toEqual({ inicio: '2026-12-20', fim: '2026-12-26' });
  });

  it('funções internas não são executáveis por anon', async () => {
    const { error } = await publico.rpc('_novo_token', { p_procurador_id: ids.ana, p_admin: true });
    expect(error).not.toBeNull();
  });
});

describe('PIN', () => {
  it('cria PIN e entra com ele', async () => {
    const t1 = await api.definirPin(ids.ana, '1234');
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    await expect(api.entrar(ids.ana, '1234')).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejeita PIN fora do formato', async () => {
    await expect(api.definirPin(ids.ana, '12a4')).rejects.toThrow('O PIN deve ter de 4 a 6 dígitos.');
    await expect(api.definirPin(ids.ana, '123')).rejects.toThrow('O PIN deve ter de 4 a 6 dígitos.');
  });

  it('não permite redefinir PIN existente', async () => {
    await api.definirPin(ids.ana, '1234');
    await expect(api.definirPin(ids.ana, '9999')).rejects.toThrow('PIN já foi criado');
  });

  it('bloqueia após 5 erros', async () => {
    await api.definirPin(ids.ana, '1234');
    for (let i = 1; i <= 4; i++) {
      await expect(api.entrar(ids.ana, '0000')).rejects.toThrow(`${5 - i} tentativa(s) restante(s)`);
    }
    await expect(api.entrar(ids.ana, '0000')).rejects.toThrow('Bloqueado por 15 minutos');
    await expect(api.entrar(ids.ana, '1234')).rejects.toThrow('Bloqueado até');
  });

  it('procurador inativo não cria PIN nem entra', async () => {
    await expect(api.definirPin(ids.inativo, '1234')).rejects.toThrow('Procurador não encontrado.');
    await expect(api.entrar(ids.inativo, '1234')).rejects.toThrow('Procurador não encontrado.');
  });
});

describe('salvar_minhas_ferias', () => {
  let token: string;
  beforeEach(async () => { token = await api.definirPin(ids.ana, '1234'); });

  const TRINTA = [{ inicio: '2027-03-01', fim: '2027-03-15' }, { inicio: '2027-07-01', fim: '2027-07-15' }];

  it('salva 30 dias e o recesso', async () => {
    await api.salvarMinhasFerias(token, TRINTA, 'natal');
    expect(await periodosDe(ids.ana)).toEqual(TRINTA);
    const d = await api.dadosPublicos();
    expect(d.procuradores.find(p => p.id === ids.ana)?.recesso).toBe('natal');
  });

  it.each([
    [[{ inicio: '2027-03-01', fim: '2027-03-15' }, { inicio: '2027-07-01', fim: '2027-07-16' }], null, 'Soma ultrapassa 30 dias (31).'],
    [[{ inicio: '2026-12-28', fim: '2027-01-05' }], null, 'Período 1: deve estar dentro de 2027.'],
    [[{ inicio: '2027-03-10', fim: '2027-03-01' }], null, 'Período 1: o fim é anterior ao início.'],
    [[{ inicio: '2027-02-30', fim: '2027-03-01' }], null, 'Período 1: data inválida.'],
    [[{ inicio: '2027-03-01', fim: '2027-03-10' }, { inicio: '2027-03-10', fim: '2027-03-12' }], null, 'Períodos 1 e 2 se sobrepõem.'],
    [[{ inicio: '2027-01-02', fim: '2027-01-05' }], 'ano_novo', 'Período 1 sobrepõe o recesso escolhido.'],
  ] as const)('rejeita %j', async (periodos, recesso, mensagem) => {
    await expect(api.salvarMinhasFerias(token, [...periodos], recesso)).rejects.toThrow(mensagem);
  });

  it('falha não altera a marcação anterior', async () => {
    await api.salvarMinhasFerias(token, TRINTA, 'natal');
    await expect(api.salvarMinhasFerias(token, [{ inicio: '2027-01-01', fim: '2027-02-15' }], 'natal')).rejects.toThrow();
    expect(await periodosDe(ids.ana)).toEqual(TRINTA);
  });

  it('só altera o dono do token', async () => {
    await api.salvarMinhasFerias(token, TRINTA, 'natal');
    const tBruno = await api.definirPin(ids.bruno, '5555');
    await api.salvarMinhasFerias(tBruno, [{ inicio: '2027-05-03', fim: '2027-05-07' }], 'ano_novo');
    expect(await periodosDe(ids.ana)).toEqual(TRINTA);
    expect(await periodosDe(ids.bruno)).toEqual([{ inicio: '2027-05-03', fim: '2027-05-07' }]);
  });

  it('token inválido ou vencido gera sessão expirada', async () => {
    await expect(api.salvarMinhasFerias('nao-existe', [], null)).rejects.toMatchObject({ sessaoExpirada: true });
    const { error } = await servico.from('sessoes').update({ expira_em: '2000-01-01T00:00:00Z' }).eq('token', token);
    expect(error).toBeNull();
    await expect(api.salvarMinhasFerias(token, [], null)).rejects.toMatchObject({ sessaoExpirada: true });
  });

  it('salvamentos simultâneos não duplicam períodos', async () => {
    const a = [{ inicio: '2027-05-01', fim: '2027-05-10' }];
    const b = [{ inicio: '2027-08-02', fim: '2027-08-06' }, { inicio: '2027-09-06', fim: '2027-09-10' }];
    await Promise.all([api.salvarMinhasFerias(token, a, null), api.salvarMinhasFerias(token, b, null)]);
    expect([a, b]).toContainEqual(await periodosDe(ids.ana));
  });

  it('sair invalida o token', async () => {
    await api.sair(token);
    await expect(api.salvarMinhasFerias(token, [], null)).rejects.toMatchObject({ sessaoExpirada: true });
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `rtk npm run test:integration`
Expected: FAIL — `Could not find the function public.dados_publicos` (e similares).

- [ ] **Step 7: Criar `supabase/migrations/20261005000004_rpcs_publicas.sql`**

```sql
-- ===== Funções internas =====

create or replace function _novo_token(p_procurador_id bigint, p_admin boolean) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
  delete from sessoes where expira_em < now();
  insert into sessoes (token, procurador_id, admin, expira_em)
  values (v_token, p_procurador_id, p_admin, now() + interval '4 hours');
  return v_token;
end $$;

create or replace function _procurador_da_sessao(p_token text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id bigint;
begin
  select s.procurador_id into v_id
    from sessoes s join procuradores p on p.id = s.procurador_id
   where s.token = p_token and not s.admin and s.expira_em > now() and p.ativo;
  if v_id is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  return v_id;
end $$;

create or replace function _exigir_admin(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from sessoes where token = p_token and admin and expira_em > now()) then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
end $$;

-- Mesmas regras e mensagens de src/lib/regras.ts.
create or replace function _salvar_ferias(p_procurador_id bigint, p_periodos jsonb, p_recesso text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ini date[] := '{}';
  v_fim date[] := '{}';
  v_total int := 0;
  v_n int;
  v_rec_ini date;
  v_rec_fim date;
  d_ini date;
  d_fim date;
  r record;
begin
  -- Serializa salvamentos concorrentes do mesmo Procurador (evita períodos duplicados).
  perform 1 from procuradores where id = p_procurador_id for update;
  if not found then
    raise exception 'Procurador não encontrado.';
  end if;
  if p_recesso is not null and p_recesso not in ('natal', 'ano_novo') then
    raise exception 'Recesso inválido.';
  end if;
  if p_periodos is null or jsonb_typeof(p_periodos) <> 'array' then
    raise exception 'Lista de períodos inválida.';
  end if;

  for r in select e.valor, e.n from jsonb_array_elements(p_periodos) with ordinality as e(valor, n) loop
    begin
      d_ini := (r.valor ->> 'inicio')::date;
      d_fim := (r.valor ->> 'fim')::date;
    exception when others then
      raise exception 'Período %: data inválida.', r.n;
    end;
    if d_ini is null or d_fim is null then
      raise exception 'Período %: data inválida.', r.n;
    end if;
    if d_fim < d_ini then
      raise exception 'Período %: o fim é anterior ao início.', r.n;
    end if;
    if d_ini < date '2027-01-01' or d_fim > date '2027-12-31' then
      raise exception 'Período %: deve estar dentro de 2027.', r.n;
    end if;
    v_ini := v_ini || d_ini;
    v_fim := v_fim || d_fim;
    v_total := v_total + (d_fim - d_ini + 1);
  end loop;

  if v_total > 30 then
    raise exception 'Soma ultrapassa 30 dias (%).', v_total;
  end if;

  v_n := coalesce(array_length(v_ini, 1), 0);
  for i in 1 .. v_n loop
    for j in i + 1 .. v_n loop
      if v_ini[i] <= v_fim[j] and v_ini[j] <= v_fim[i] then
        raise exception 'Períodos % e % se sobrepõem.', i, j;
      end if;
    end loop;
  end loop;

  if p_recesso is not null then
    select case when p_recesso = 'natal' then recesso_natal_inicio else recesso_ano_novo_inicio end,
           case when p_recesso = 'natal' then recesso_natal_fim else recesso_ano_novo_fim end
      into v_rec_ini, v_rec_fim
      from config;
    for i in 1 .. v_n loop
      if v_ini[i] <= v_rec_fim and v_rec_ini <= v_fim[i] then
        raise exception 'Período % sobrepõe o recesso escolhido.', i;
      end if;
    end loop;
  end if;

  delete from periodos_ferias where procurador_id = p_procurador_id;
  insert into periodos_ferias (procurador_id, inicio, fim)
  select p_procurador_id, x.i, x.f from unnest(v_ini, v_fim) as x(i, f);
  update procuradores set recesso = p_recesso where id = p_procurador_id;
end $$;

-- ===== RPCs públicas =====

create or replace function dados_publicos() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'setores', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'ordem', ordem) order by ordem, nome) from setores), '[]'::jsonb),
    'procuradores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'nome', nome, 'setor_id', setor_id, 'recesso', recesso, 'ativo', ativo, 'tem_pin', pin_hash is not null
      ) order by nome) from procuradores), '[]'::jsonb),
    'periodos', coalesce((select jsonb_agg(jsonb_build_object('procurador_id', procurador_id, 'inicio', inicio, 'fim', fim)
      order by procurador_id, inicio) from periodos_ferias), '[]'::jsonb),
    'dias_especiais', coalesce((select jsonb_agg(jsonb_build_object('data', data, 'tipo', tipo, 'descricao', descricao)
      order by data) from dias_especiais), '[]'::jsonb),
    'recesso', (select jsonb_build_object(
        'natal', jsonb_build_object('inicio', recesso_natal_inicio, 'fim', recesso_natal_fim),
        'ano_novo', jsonb_build_object('inicio', recesso_ano_novo_inicio, 'fim', recesso_ano_novo_fim)
      ) from config)
  );
$$;

create or replace function definir_pin(p_procurador_id bigint, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v procuradores;
begin
  select * into v from procuradores where id = p_procurador_id and ativo for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Procurador não encontrado.');
  end if;
  if v.pin_hash is not null then
    return jsonb_build_object('ok', false, 'erro', 'PIN já foi criado para este nome. Use "Entrar" ou peça ao administrador para resetar.');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'erro', 'O PIN deve ter de 4 a 6 dígitos.');
  end if;
  update procuradores
     set pin_hash = crypt(p_pin, gen_salt('bf')), tentativas_falhas = 0, bloqueado_ate = null
   where id = v.id;
  return jsonb_build_object('ok', true, 'token', _novo_token(v.id, false));
end $$;

-- Retorna jsonb em vez de lançar exceção: o incremento de tentativas precisa ser gravado.
create or replace function entrar(p_procurador_id bigint, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v procuradores;
begin
  select * into v from procuradores where id = p_procurador_id and ativo for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Procurador não encontrado.');
  end if;
  if v.pin_hash is null then
    return jsonb_build_object('ok', false, 'erro', 'PIN ainda não criado.');
  end if;
  if v.bloqueado_ate is not null and v.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro',
      'Bloqueado até ' || to_char(v.bloqueado_ate at time zone 'America/Sao_Paulo', 'HH24:MI') || '.');
  end if;
  if crypt(coalesce(p_pin, ''), v.pin_hash) <> v.pin_hash then
    if v.tentativas_falhas + 1 >= 5 then
      update procuradores set tentativas_falhas = 0, bloqueado_ate = now() + interval '15 minutes' where id = v.id;
      return jsonb_build_object('ok', false, 'erro', 'PIN incorreto. Bloqueado por 15 minutos.');
    end if;
    update procuradores set tentativas_falhas = tentativas_falhas + 1 where id = v.id;
    return jsonb_build_object('ok', false, 'erro',
      format('PIN incorreto — %s tentativa(s) restante(s).', 5 - (v.tentativas_falhas + 1)));
  end if;
  update procuradores set tentativas_falhas = 0, bloqueado_ate = null where id = v.id;
  return jsonb_build_object('ok', true, 'token', _novo_token(v.id, false));
end $$;

create or replace function salvar_minhas_ferias(p_token text, p_periodos jsonb, p_recesso text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _salvar_ferias(_procurador_da_sessao(p_token), p_periodos, p_recesso);
end $$;

create or replace function sair(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from sessoes where token = p_token;
$$;

-- ===== Permissões =====

revoke execute on function _novo_token(bigint, boolean) from public, anon, authenticated;
revoke execute on function _procurador_da_sessao(text) from public, anon, authenticated;
revoke execute on function _exigir_admin(text) from public, anon, authenticated;
revoke execute on function _salvar_ferias(bigint, jsonb, text) from public, anon, authenticated;

revoke execute on function dados_publicos() from public, anon, authenticated;
revoke execute on function definir_pin(bigint, text) from public, anon, authenticated;
revoke execute on function entrar(bigint, text) from public, anon, authenticated;
revoke execute on function salvar_minhas_ferias(text, jsonb, text) from public, anon, authenticated;
revoke execute on function sair(text) from public, anon, authenticated;

grant execute on function dados_publicos() to anon, authenticated;
grant execute on function definir_pin(bigint, text) to anon, authenticated;
grant execute on function entrar(bigint, text) to anon, authenticated;
grant execute on function salvar_minhas_ferias(text, jsonb, text) to anon, authenticated;
grant execute on function sair(text) to anon, authenticated;
```

- [ ] **Step 8: Aplicar e rodar**

Run: `rtk npm run db:push:test` e depois `rtk npm run test:integration`
Expected: push da migration 4 concluído; todos os testes de integração PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add supabase/migrations/20261005000004_rpcs_publicas.sql src/api/rpc.ts tests/unit/rpc.test.ts tests/integration/procurador.test.ts
rtk git commit -m "feat: RPCs de PIN, sessão e marcação de férias + cliente da API"
```

---

### Task 8: RPCs do administrador

**Files:**
- Create: `supabase/migrations/20261005000005_rpcs_admin.sql`
- Test: `tests/integration/admin.test.ts`

**Interfaces:**
- Consumes: `_novo_token`, `_exigir_admin`, `_salvar_ferias` (Task 7); cliente `criarApi` (Task 7) — os métodos `admin*` já existem lá.
- Produces (SQL, todas executáveis por anon, protegidas por token admin): `admin_entrar(p_senha text) returns jsonb`, `admin_salvar_setor(p_token text, p_id bigint, p_nome text, p_ordem int) returns bigint`, `admin_excluir_setor(p_token text, p_id bigint)`, `admin_salvar_procurador(p_token text, p_id bigint, p_nome text, p_setor_id bigint, p_ativo boolean) returns bigint`, `admin_excluir_procurador(p_token text, p_id bigint)`, `admin_resetar_pin(p_token text, p_procurador_id bigint)`, `admin_salvar_dia_especial(p_token text, p_data date, p_tipo text, p_descricao text)`, `admin_excluir_dia_especial(p_token text, p_data date)`, `admin_salvar_recesso(p_token text, p_natal_inicio date, p_natal_fim date, p_ano_novo_inicio date, p_ano_novo_fim date)`, `admin_salvar_ferias(p_token text, p_procurador_id bigint, p_periodos jsonb, p_recesso text)`, `admin_trocar_senha(p_token text, p_senha_atual text, p_nova text)`.

- [ ] **Step 1: Escrever o teste que falha — `tests/integration/admin.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { criarApi, type ClienteRpc } from '../../src/api/rpc';
import { publico, resetar, SENHA_ADMIN, type Ids } from './ambiente';

const api = criarApi(publico as unknown as ClienteRpc);
let ids: Ids;
let t: string;

beforeEach(async () => {
  ids = await resetar();
  t = await api.adminEntrar(SENHA_ADMIN);
});

describe('admin', () => {
  it('rejeita senha errada', async () => {
    await expect(api.adminEntrar('errada')).rejects.toThrow('Senha incorreta.');
  });

  it('exige token de admin (token de Procurador não serve)', async () => {
    const tAna = await api.definirPin(ids.ana, '1234');
    await expect(api.adminSalvarSetor(tAna, null, 'X', 1)).rejects.toMatchObject({ sessaoExpirada: true });
  });

  it('CRUD de setores', async () => {
    const id = await api.adminSalvarSetor(t, null, 'Novo Setor', 3);
    await api.adminSalvarSetor(t, id, 'Setor Renomeado', 4);
    let d = await api.dadosPublicos();
    expect(d.setores.find(s => s.id === id)).toEqual({ id, nome: 'Setor Renomeado', ordem: 4 });
    await expect(api.adminSalvarSetor(t, null, 'Setor A', 1)).rejects.toThrow('Já existe um setor com esse nome.');
    await expect(api.adminSalvarSetor(t, null, '   ', 1)).rejects.toThrow('Informe o nome do setor.');
    await expect(api.adminExcluirSetor(t, ids.setorA)).rejects.toThrow('Setor possui Procuradores');
    await api.adminExcluirSetor(t, id);
    d = await api.dadosPublicos();
    expect(d.setores.some(s => s.id === id)).toBe(false);
  });

  it('CRUD de Procuradores', async () => {
    const id = await api.adminSalvarProcurador(t, null, 'Carla', ids.setorB, true);
    await api.adminSalvarProcurador(t, id, 'Carla Souza', ids.setorA, true);
    let d = await api.dadosPublicos();
    expect(d.procuradores.find(p => p.id === id)).toMatchObject({ nome: 'Carla Souza', setor_id: ids.setorA, ativo: true });
    await expect(api.adminSalvarProcurador(t, null, 'Ana', ids.setorA, true)).rejects.toThrow('Já existe um Procurador com esse nome.');
    await expect(api.adminSalvarProcurador(t, null, 'Sem Setor', null, true)).rejects.toThrow('Setor inválido.');
    await api.adminExcluirProcurador(t, id);
    d = await api.dadosPublicos();
    expect(d.procuradores.some(p => p.id === id)).toBe(false);
  });

  it('inativar derruba a sessão e impede novo login', async () => {
    const tAna = await api.definirPin(ids.ana, '1234');
    await api.adminSalvarProcurador(t, ids.ana, 'Ana', ids.setorA, false);
    await expect(api.salvarMinhasFerias(tAna, [], null)).rejects.toMatchObject({ sessaoExpirada: true });
    await expect(api.entrar(ids.ana, '1234')).rejects.toThrow('Procurador não encontrado.');
  });

  it('reseta PIN', async () => {
    const tAna = await api.definirPin(ids.ana, '1234');
    await api.adminResetarPin(t, ids.ana);
    const d = await api.dadosPublicos();
    expect(d.procuradores.find(p => p.id === ids.ana)?.tem_pin).toBe(false);
    await expect(api.salvarMinhasFerias(tAna, [], null)).rejects.toMatchObject({ sessaoExpirada: true });
    await expect(api.definirPin(ids.ana, '9999')).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it('dias especiais: inclui, altera e remove', async () => {
    await api.adminSalvarDiaEspecial(t, { data: '2027-02-08', tipo: 'facultativo', descricao: 'Carnaval' });
    await api.adminSalvarDiaEspecial(t, { data: '2027-02-08', tipo: 'facultativo', descricao: 'Carnaval (segunda)' });
    let d = await api.dadosPublicos();
    expect(d.dias_especiais).toContainEqual({ data: '2027-02-08', tipo: 'facultativo', descricao: 'Carnaval (segunda)' });
    await expect(api.adminSalvarDiaEspecial(t, { data: '2027-02-09', tipo: 'outro' as never, descricao: 'x' })).rejects.toThrow('Tipo inválido.');
    await api.adminExcluirDiaEspecial(t, '2027-02-08');
    d = await api.dadosPublicos();
    expect(d.dias_especiais.some(x => x.data === '2027-02-08')).toBe(false);
  });

  it('alterar recesso não apaga marcações em conflito', async () => {
    const tAna = await api.definirPin(ids.ana, '1234');
    await api.salvarMinhasFerias(tAna, [{ inicio: '2027-01-03', fim: '2027-01-05' }], 'ano_novo');
    await api.adminSalvarRecesso(t, {
      natal: { inicio: '2026-12-20', fim: '2026-12-26' },
      ano_novo: { inicio: '2026-12-28', fim: '2027-01-04' },
    });
    const d = await api.dadosPublicos();
    expect(d.recesso.ano_novo).toEqual({ inicio: '2026-12-28', fim: '2027-01-04' });
    expect(d.periodos.filter(p => p.procurador_id === ids.ana)).toHaveLength(1);
    await expect(api.adminSalvarRecesso(t, {
      natal: { inicio: '2026-12-26', fim: '2026-12-20' },
      ano_novo: { inicio: '2026-12-28', fim: '2027-01-04' },
    })).rejects.toThrow('Datas de recesso inválidas.');
  });

  it('salva férias de terceiros com as mesmas regras', async () => {
    await expect(api.adminSalvarFerias(t, ids.bruno, [{ inicio: '2027-01-04', fim: '2027-02-03' }], null))
      .rejects.toThrow('Soma ultrapassa 30 dias (31).');
    await api.adminSalvarFerias(t, ids.bruno, [{ inicio: '2027-01-04', fim: '2027-02-02' }], 'natal');
    const d = await api.dadosPublicos();
    expect(d.periodos.filter(p => p.procurador_id === ids.bruno)).toHaveLength(1);
  });

  it('troca a senha', async () => {
    await expect(api.adminTrocarSenha(t, 'errada', 'nova-senha-123')).rejects.toThrow('Senha atual incorreta.');
    await expect(api.adminTrocarSenha(t, SENHA_ADMIN, 'curta')).rejects.toThrow('A nova senha deve ter ao menos 8 caracteres.');
    await api.adminTrocarSenha(t, SENHA_ADMIN, 'nova-senha-123');
    await expect(api.adminEntrar('nova-senha-123')).resolves.toMatch(/^[0-9a-f]{64}$/);
    await expect(api.adminEntrar(SENHA_ADMIN)).rejects.toThrow('Senha incorreta.');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npm run test:integration`
Expected: FAIL em `admin.test.ts` — `Could not find the function public.admin_entrar`.

- [ ] **Step 3: Criar `supabase/migrations/20261005000005_rpcs_admin.sql`**

```sql
create or replace function admin_entrar(p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  select admin_hash into v_hash from config;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'erro', 'Senha de administrador não configurada.');
  end if;
  if crypt(coalesce(p_senha, ''), v_hash) <> v_hash then
    perform pg_sleep(1); -- encarece tentativas de força bruta
    return jsonb_build_object('ok', false, 'erro', 'Senha incorreta.');
  end if;
  return jsonb_build_object('ok', true, 'token', _novo_token(null, true));
end $$;

create or replace function admin_salvar_setor(p_token text, p_id bigint, p_nome text, p_ordem int) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id bigint;
begin
  perform _exigir_admin(p_token);
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome do setor.';
  end if;
  if p_id is null then
    insert into setores (nome, ordem) values (trim(p_nome), coalesce(p_ordem, 0)) returning id into v_id;
  else
    update setores set nome = trim(p_nome), ordem = coalesce(p_ordem, 0) where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Setor não encontrado.';
    end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Já existe um setor com esse nome.';
end $$;

create or replace function admin_excluir_setor(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _exigir_admin(p_token);
  delete from setores where id = p_id;
exception
  when foreign_key_violation then raise exception 'Setor possui Procuradores; mova-os ou exclua-os antes.';
end $$;

create or replace function admin_salvar_procurador(p_token text, p_id bigint, p_nome text, p_setor_id bigint, p_ativo boolean) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id bigint;
begin
  perform _exigir_admin(p_token);
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome do Procurador.';
  end if;
  if p_id is null then
    insert into procuradores (nome, setor_id, ativo) values (trim(p_nome), p_setor_id, coalesce(p_ativo, true))
    returning id into v_id;
  else
    update procuradores set nome = trim(p_nome), setor_id = p_setor_id, ativo = coalesce(p_ativo, true)
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Procurador não encontrado.';
    end if;
    if not coalesce(p_ativo, true) then
      delete from sessoes where procurador_id = p_id;
    end if;
  end if;
  return v_id;
exception
  when unique_violation then raise exception 'Já existe um Procurador com esse nome.';
  when foreign_key_violation or not_null_violation then raise exception 'Setor inválido.';
end $$;

create or replace function admin_excluir_procurador(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _exigir_admin(p_token);
  delete from procuradores where id = p_id;
end $$;

create or replace function admin_resetar_pin(p_token text, p_procurador_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _exigir_admin(p_token);
  update procuradores set pin_hash = null, tentativas_falhas = 0, bloqueado_ate = null where id = p_procurador_id;
  if not found then
    raise exception 'Procurador não encontrado.';
  end if;
  delete from sessoes where procurador_id = p_procurador_id;
end $$;

create or replace function admin_salvar_dia_especial(p_token text, p_data date, p_tipo text, p_descricao text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _exigir_admin(p_token);
  if p_data is null then
    raise exception 'Informe a data.';
  end if;
  if p_tipo is null or p_tipo not in ('feriado', 'facultativo') then
    raise exception 'Tipo inválido.';
  end if;
  if coalesce(trim(p_descricao), '') = '' then
    raise exception 'Informe a descrição.';
  end if;
  insert into dias_especiais (data, tipo, descricao) values (p_data, p_tipo, trim(p_descricao))
  on conflict (data) do update set tipo = excluded.tipo, descricao = excluded.descricao;
end $$;

create or replace function admin_excluir_dia_especial(p_token text, p_data date) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _exigir_admin(p_token);
  delete from dias_especiais where data = p_data;
end $$;

-- Não apaga marcações: conflitos aparecem no admin e no editor até o Procurador corrigir.
create or replace function admin_salvar_recesso(p_token text, p_natal_inicio date, p_natal_fim date,
                                                p_ano_novo_inicio date, p_ano_novo_fim date) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _exigir_admin(p_token);
  if p_natal_inicio is null or p_natal_fim is null or p_ano_novo_inicio is null or p_ano_novo_fim is null
     or p_natal_fim < p_natal_inicio or p_ano_novo_fim < p_ano_novo_inicio then
    raise exception 'Datas de recesso inválidas.';
  end if;
  update config
     set recesso_natal_inicio = p_natal_inicio, recesso_natal_fim = p_natal_fim,
         recesso_ano_novo_inicio = p_ano_novo_inicio, recesso_ano_novo_fim = p_ano_novo_fim
   where id;
end $$;

create or replace function admin_salvar_ferias(p_token text, p_procurador_id bigint, p_periodos jsonb, p_recesso text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _exigir_admin(p_token);
  perform _salvar_ferias(p_procurador_id, p_periodos, p_recesso);
end $$;

create or replace function admin_trocar_senha(p_token text, p_senha_atual text, p_nova text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  perform _exigir_admin(p_token);
  select admin_hash into v_hash from config;
  if v_hash is null or crypt(coalesce(p_senha_atual, ''), v_hash) <> v_hash then
    raise exception 'Senha atual incorreta.';
  end if;
  if length(coalesce(p_nova, '')) < 8 then
    raise exception 'A nova senha deve ter ao menos 8 caracteres.';
  end if;
  update config set admin_hash = crypt(p_nova, gen_salt('bf')) where id;
  delete from sessoes where admin and token <> p_token;
end $$;

-- ===== Permissões =====

revoke execute on function admin_entrar(text) from public, anon, authenticated;
revoke execute on function admin_salvar_setor(text, bigint, text, int) from public, anon, authenticated;
revoke execute on function admin_excluir_setor(text, bigint) from public, anon, authenticated;
revoke execute on function admin_salvar_procurador(text, bigint, text, bigint, boolean) from public, anon, authenticated;
revoke execute on function admin_excluir_procurador(text, bigint) from public, anon, authenticated;
revoke execute on function admin_resetar_pin(text, bigint) from public, anon, authenticated;
revoke execute on function admin_salvar_dia_especial(text, date, text, text) from public, anon, authenticated;
revoke execute on function admin_excluir_dia_especial(text, date) from public, anon, authenticated;
revoke execute on function admin_salvar_recesso(text, date, date, date, date) from public, anon, authenticated;
revoke execute on function admin_salvar_ferias(text, bigint, jsonb, text) from public, anon, authenticated;
revoke execute on function admin_trocar_senha(text, text, text) from public, anon, authenticated;

grant execute on function admin_entrar(text) to anon, authenticated;
grant execute on function admin_salvar_setor(text, bigint, text, int) to anon, authenticated;
grant execute on function admin_excluir_setor(text, bigint) to anon, authenticated;
grant execute on function admin_salvar_procurador(text, bigint, text, bigint, boolean) to anon, authenticated;
grant execute on function admin_excluir_procurador(text, bigint) to anon, authenticated;
grant execute on function admin_resetar_pin(text, bigint) to anon, authenticated;
grant execute on function admin_salvar_dia_especial(text, date, text, text) to anon, authenticated;
grant execute on function admin_excluir_dia_especial(text, date) to anon, authenticated;
grant execute on function admin_salvar_recesso(text, date, date, date, date) to anon, authenticated;
grant execute on function admin_salvar_ferias(text, bigint, jsonb, text) to anon, authenticated;
grant execute on function admin_trocar_senha(text, text, text) to anon, authenticated;
```

- [ ] **Step 4: Aplicar e rodar**

Run: `rtk npm run db:push:test` e depois `rtk npm run test:integration`
Expected: todos os testes de integração PASS (acesso, procurador, admin).

- [ ] **Step 5: Commit**

```bash
rtk git add supabase/migrations/20261005000005_rpcs_admin.sql tests/integration/admin.test.ts
rtk git commit -m "feat: RPCs do administrador"
```

---

### Task 9: Base de UI — helper DOM, sessão local e Gantt

**Files:**
- Create: `src/ui/dom.ts`, `src/api/sessao.ts`, `src/ui/gantt.ts`
- Test: `tests/unit/sessao.test.ts`, `tests/unit/gantt.test.ts`

**Interfaces:**
- Consumes: `escala` (Task 5), `ocupacao` (Task 3), `regras` (Task 2), `datas` (Task 1), `ROTULO_RECESSO` (Task 4).
- Produces:
  - `h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, Valor>, ...filhos: Filho[]): HTMLElementTagNameMap[K]` — atributos `on*` com função viram listeners; `value`/`checked` viram propriedades; `false`/`null`/`undefined` são ignorados; `true` vira atributo vazio.
  - `aviso(tipo: 'erro' | 'ok' | 'info', texto: string): HTMLParagraphElement`
  - `type TipoSessao = 'proc' | 'admin'`, `interface Sessao { token: string; procuradorId: number | null; expiraEm: number }`, `VALIDADE_MS`, `lerSessao(t: TipoSessao, agora?: number): Sessao | null`, `gravarSessao(t: TipoSessao, token: string, procuradorId: number | null, agora?: number): void`, `limparSessao(t: TipoSessao): void`. Chave no storage: `marca-ferias:sessao:<tipo>`.
  - `interface OpcoesGantt { zoom: Zoom; setorId: number | null; aoClicarProcurador: (id: number) => void }`, `renderGantt(dados: DadosPublicos, op: OpcoesGantt): HTMLElement`. Classes CSS usadas (estilizadas na Task 10): `gantt`, `gantt-grade`, `gantt-fundo`, `faixa fds|feriado|facultativo`, `linha`, `cabecalho`, `setor-titulo`, `ocupacao`, `rotulo`, `rotulo-proc`, `trilha`, `mes`, `num-dia`, `barra ferias`, `barra recesso`, `celula`, `selo completo|pendente`.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/sessao.test.ts`:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { gravarSessao, lerSessao, limparSessao, VALIDADE_MS } from '../../src/api/sessao';

beforeEach(() => localStorage.clear());

describe('sessão local', () => {
  it('grava e lê dentro da validade', () => {
    gravarSessao('proc', 'tok', 7, 1000);
    expect(lerSessao('proc', 2000)).toEqual({ token: 'tok', procuradorId: 7, expiraEm: 1000 + VALIDADE_MS });
  });

  it('sessão vencida retorna null e é removida', () => {
    gravarSessao('proc', 'tok', 7, 0);
    expect(lerSessao('proc', VALIDADE_MS + 1)).toBeNull();
    expect(localStorage.getItem('marca-ferias:sessao:proc')).toBeNull();
  });

  it('conteúdo corrompido retorna null', () => {
    localStorage.setItem('marca-ferias:sessao:proc', '{nao json');
    expect(lerSessao('proc')).toBeNull();
  });

  it('sessões de Procurador e admin são independentes', () => {
    gravarSessao('proc', 'p', 1);
    gravarSessao('admin', 'a', null);
    limparSessao('proc');
    expect(lerSessao('proc')).toBeNull();
    expect(lerSessao('admin')?.token).toBe('a');
  });
});
```

`tests/unit/gantt.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npm test`
Expected: FAIL — módulos `sessao` e `gantt` inexistentes.

- [ ] **Step 3: Implementar `src/ui/dom.ts`**

```ts
type Filho = Node | string | null | undefined | false;
type Valor = string | number | boolean | null | undefined | ((ev: Event) => void);

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, Valor> = {},
  ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (k === 'value' || k === 'checked') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of filhos) if (f !== null && f !== undefined && f !== false) el.append(f);
  return el;
}

export function aviso(tipo: 'erro' | 'ok' | 'info', texto: string): HTMLParagraphElement {
  return h('p', { class: `aviso aviso-${tipo}`, role: tipo === 'erro' ? 'alert' : 'status' }, texto);
}
```

- [ ] **Step 4: Implementar `src/api/sessao.ts`**

```ts
export type TipoSessao = 'proc' | 'admin';

export interface Sessao {
  token: string;
  procuradorId: number | null;
  expiraEm: number;
}

export const VALIDADE_MS = 4 * 60 * 60 * 1000;

const chave = (t: TipoSessao) => `marca-ferias:sessao:${t}`;

export function lerSessao(t: TipoSessao, agora = Date.now()): Sessao | null {
  try {
    const bruto = localStorage.getItem(chave(t));
    if (!bruto) return null;
    const s = JSON.parse(bruto) as Sessao;
    if (typeof s.token !== 'string' || typeof s.expiraEm !== 'number' || s.expiraEm <= agora) {
      localStorage.removeItem(chave(t));
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function gravarSessao(t: TipoSessao, token: string, procuradorId: number | null, agora = Date.now()): void {
  try {
    const s: Sessao = { token, procuradorId, expiraEm: agora + VALIDADE_MS };
    localStorage.setItem(chave(t), JSON.stringify(s));
  } catch {
    // Sem storage (modo privado): a sessão vale só enquanto a página estiver aberta.
  }
}

export function limparSessao(t: TipoSessao): void {
  try {
    localStorage.removeItem(chave(t));
  } catch {
    // ignorado
  }
}
```

- [ ] **Step 5: Implementar `src/ui/gantt.ts`**

```ts
import { diaDaSemana, diasCorridos, formatarBR, somarDias } from '../lib/datas';
import { geometria, INICIO_GANTT, meses, PX_POR_DIA, totalDiasGantt, type Zoom } from '../lib/escala';
import { ausenciasNoDia, periodosDe, procuradoresDoSetor, setoresOrdenados } from '../lib/ocupacao';
import { statusProcurador } from '../lib/regras';
import { ROTULO_RECESSO } from '../lib/rotulos';
import type { DadosPublicos, Procurador } from '../lib/tipos';
import { h } from './dom';

export interface OpcoesGantt {
  zoom: Zoom;
  setorId: number | null;
  aoClicarProcurador: (id: number) => void;
}

export function renderGantt(dados: DadosPublicos, op: OpcoesGantt): HTMLElement {
  const px = PX_POR_DIA[op.zoom];
  const n = totalDiasGantt();
  const grade = h('div', { class: 'gantt-grade', style: `--trilha:${n * px}px` });

  grade.append(fundo(dados, px, n), cabecalho(op.zoom, px, n));

  const setores = setoresOrdenados(dados).filter(s => op.setorId === null || s.id === op.setorId);
  for (const s of setores) {
    const procs = procuradoresDoSetor(dados, s.id);
    grade.append(h('div', { class: 'linha setor-titulo' },
      h('div', { class: 'rotulo' }, `${s.nome} (${procs.length})`),
      h('div', { class: 'trilha' })));
    for (const p of procs) grade.append(linhaProcurador(dados, p, op));
    if (procs.length) grade.append(linhaOcupacao(dados, s.id, op.zoom, px, n));
  }

  return h('div', { class: 'gantt' }, grade);
}

function fundo(dados: DadosPublicos, px: number, n: number): HTMLElement {
  const especiais = new Map(dados.dias_especiais.map(d => [d.data, d.tipo]));
  const el = h('div', { class: 'gantt-fundo', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    const dia = somarDias(INICIO_GANTT, i);
    const dow = diaDaSemana(dia);
    const classe = especiais.get(dia) ?? (dow === 0 || dow === 6 ? 'fds' : null);
    if (classe) el.append(h('div', { class: `faixa ${classe}`, style: `left:${i * px}px;width:${px}px` }));
  }
  return el;
}

function cabecalho(zoom: Zoom, px: number, n: number): HTMLElement {
  const trilha = h('div', { class: 'trilha' });
  for (const m of meses()) {
    const cabe = zoom !== 'ano' || m.dias >= 15;
    trilha.append(h('div', { class: 'mes', style: `left:${m.inicio * px}px;width:${m.dias * px}px` }, cabe ? m.rotulo : ''));
  }
  if (zoom === 'mes') {
    for (let i = 0; i < n; i++) {
      trilha.append(h('div', { class: 'num-dia', style: `left:${i * px}px;width:${px}px` }, somarDias(INICIO_GANTT, i).slice(8)));
    }
  }
  return h('div', { class: 'linha cabecalho' }, h('div', { class: 'rotulo' }, 'Procurador'), trilha);
}

function linhaProcurador(dados: DadosPublicos, p: Procurador, op: OpcoesGantt): HTMLElement {
  const periodos = periodosDe(dados, p.id);
  const status = statusProcurador(periodos, p.recesso);
  const trilha = h('div', { class: 'trilha' });

  for (const per of periodos) {
    const g = geometria(per, op.zoom);
    if (!g) continue;
    const texto = `${p.nome}: ${formatarBR(per.inicio)} a ${formatarBR(per.fim)} (${diasCorridos(per)} dias)`;
    trilha.append(h('button', {
      type: 'button', class: 'barra ferias', style: `left:${g.left}px;width:${g.width}px`,
      title: texto, 'aria-label': texto, onclick: () => op.aoClicarProcurador(p.id),
    }));
  }

  if (p.recesso) {
    const r = dados.recesso[p.recesso];
    const g = geometria(r, op.zoom);
    if (g) {
      trilha.append(h('div', {
        class: 'barra recesso', style: `left:${g.left}px;width:${g.width}px`,
        title: `${p.nome}: recesso (${ROTULO_RECESSO[p.recesso]}) ${formatarBR(r.inicio)} a ${formatarBR(r.fim)}`,
      }));
    }
  }

  return h('div', { class: 'linha' },
    h('button', { type: 'button', class: 'rotulo rotulo-proc', onclick: () => op.aoClicarProcurador(p.id) },
      p.nome, h('span', { class: `selo ${status}` }, status)),
    trilha);
}

function linhaOcupacao(dados: DadosPublicos, setorId: number, zoom: Zoom, px: number, n: number): HTMLElement {
  const trilha = h('div', { class: 'trilha' });
  for (let i = 0; i < n; i++) {
    const dia = somarDias(INICIO_GANTT, i);
    const o = ausenciasNoDia(dados, setorId, dia);
    const alfa = o.total ? ((o.total - o.presentes) / o.total) * 0.9 : 0;
    const fora = o.ausentes.map(a => a.procurador.nome + (a.motivo === 'recesso' ? ' (recesso)' : '')).join(', ');
    trilha.append(h('div', {
      class: 'celula',
      style: `left:${i * px}px;width:${px}px;background-color:rgba(var(--calor-rgb),${alfa.toFixed(2)})`,
      title: `${formatarBR(dia)}: ${o.presentes}/${o.total} presentes${fora ? ' — fora: ' + fora : ''}`,
    }, zoom === 'mes' ? String(o.presentes) : ''));
  }
  return h('div', { class: 'linha ocupacao' }, h('div', { class: 'rotulo' }, 'Presentes no setor'), trilha);
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `rtk npm test` e `rtk npx tsc --noEmit`
Expected: PASS; sem erros de tipo.

- [ ] **Step 7: Commit**

```bash
rtk git add src/ui/dom.ts src/api/sessao.ts src/ui/gantt.ts tests/unit/sessao.test.ts tests/unit/gantt.test.ts
rtk git commit -m "feat: helper DOM, sessão local e renderização do Gantt"
```

---

### Task 10: Telas públicas — calendário e "Marcar minhas férias"

**Files:**
- Create: `index.html`, `src/styles.css`, `src/api/index.ts`, `src/ui/formFerias.ts`, `src/ui/telaPrincipal.ts`, `src/ui/editor.ts`, `src/main.ts`, `scripts/dados-exemplo.mjs`
- Test: verificação manual no navegador (Step 10) + `rtk npm run build`

**Interfaces:**
- Consumes: `criarApi`, `ErroApi`, `mensagemDe`, `ClienteRpc` (Task 7); `lerSessao`/`gravarSessao`/`limparSessao`, `h`, `aviso`, `renderGantt` (Task 9); libs das Tasks 1–5.
- Produces:
  - `src/api/index.ts`: `configurado: boolean`, `api: Api`.
  - `src/ui/formFerias.ts`: `interface EstadoFerias { periodos: Periodo[]; recesso: Recesso | null }`, `interface OpcoesFormFerias { dados: DadosPublicos; procurador: Procurador; estado: EstadoFerias; redesenhar: () => void; salvar: (botao: HTMLButtonElement) => void }`, `formularioFerias(op: OpcoesFormFerias): HTMLElement` (reutilizado pelo admin na Task 11).
  - `montarTelaPrincipal(raiz: HTMLElement, dados: DadosPublicos): void`
  - `montarEditor(raiz: HTMLElement, inicial: DadosPublicos, recarregar: () => Promise<DadosPublicos>): void`
  - `src/main.ts`: roteador; a rota `#/admin` mostra um aviso provisório até a Task 11.

- [ ] **Step 1: Criar `index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Férias 2027 — Núcleo de Educação EFIN1</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Criar `src/styles.css`**

```css
:root {
  color-scheme: light dark;
  --fundo: #f5f6f8;
  --superficie: #ffffff;
  --superficie-2: #eef1f5;
  --texto: #1c2330;
  --texto-suave: #5b6576;
  --borda: #d5dae2;
  --borda-suave: #e9ecf0;
  --primaria: #1f5fbf;
  --primaria-texto: #ffffff;
  --perigo: #b42318;
  --ferias: #2f7de1;
  --recesso: #8a5cf6;
  --fds: rgba(120, 130, 150, 0.12);
  --feriado: rgba(225, 140, 30, 0.25);
  --facultativo: rgba(225, 190, 30, 0.2);
  --calor-rgb: 220, 38, 38;
  --ok: #1d7a3e;
  --ok-fundo: #e7f5ec;
  --erro: #b42318;
  --erro-fundo: #fdecea;
  --info-fundo: #e8f0fc;
  --rotulo: 210px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --fundo: #10141a;
    --superficie: #181e27;
    --superficie-2: #212935;
    --texto: #e6e9ef;
    --texto-suave: #9aa4b5;
    --borda: #343d4b;
    --borda-suave: #262e3a;
    --primaria: #5b9cf5;
    --primaria-texto: #0d1420;
    --perigo: #f2867b;
    --ferias: #4c93f0;
    --recesso: #a585f8;
    --fds: rgba(160, 170, 190, 0.08);
    --feriado: rgba(240, 160, 50, 0.22);
    --facultativo: rgba(240, 200, 60, 0.16);
    --calor-rgb: 248, 113, 113;
    --ok: #6fd394;
    --ok-fundo: #15301f;
    --erro: #f2867b;
    --erro-fundo: #3a1a17;
    --info-fundo: #1a2840;
  }
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--fundo); color: var(--texto); }
a { color: var(--primaria); }
h1 { font-size: 1.6rem; margin: 0 0 4px; }
h2 { font-size: 1.15rem; margin: 0 0 12px; }

.pagina { max-width: 760px; margin: 0 auto; padding: 16px; }
.pagina.larga { max-width: none; }
.topo { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.subtitulo { margin: 0; color: var(--texto-suave); }
.voltar { display: inline-block; margin-bottom: 12px; }
.rodape { margin-top: 24px; font-size: 0.85rem; color: var(--texto-suave); }
.dica { color: var(--texto-suave); font-size: 0.9rem; }

.cartao { background: var(--superficie); border: 1px solid var(--borda); border-radius: 10px; padding: 16px; margin-bottom: 16px; display: grid; gap: 10px; }
.cartao.destaque { border-color: var(--primaria); }
label { display: grid; gap: 4px; font-weight: 500; }
input, select { font: inherit; padding: 7px 9px; border: 1px solid var(--borda); border-radius: 6px; background: var(--superficie); color: var(--texto); }
input.curto { width: 80px; }

.botao { font: inherit; padding: 7px 14px; border-radius: 6px; border: 1px solid var(--borda); background: var(--superficie-2); color: var(--texto); cursor: pointer; text-decoration: none; display: inline-block; }
.botao.primario { background: var(--primaria); color: var(--primaria-texto); border-color: var(--primaria); }
.botao.perigo { color: var(--perigo); }
.botao:disabled { opacity: 0.5; cursor: not-allowed; }
.botao[aria-pressed="true"] { background: var(--primaria); color: var(--primaria-texto); border-color: var(--primaria); }

.aviso { padding: 10px 12px; border-radius: 6px; margin: 0; }
.aviso-erro { background: var(--erro-fundo); color: var(--erro); }
.aviso-ok { background: var(--ok-fundo); color: var(--ok); }
.aviso-info { background: var(--info-fundo); }

.selo { font-size: 0.72rem; padding: 1px 6px; border-radius: 999px; margin-left: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
.selo.completo { background: var(--ok-fundo); color: var(--ok); }
.selo.pendente { background: var(--superficie-2); color: var(--texto-suave); }

.barra-ferramentas { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.grupo-zoom { display: flex; gap: 4px; }
.contador-geral { margin: 0; color: var(--texto-suave); }
.legenda { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.85rem; margin-bottom: 8px; color: var(--texto-suave); }
.item-legenda { display: inline-flex; align-items: center; gap: 6px; }
.amostra { width: 18px; height: 12px; border-radius: 3px; display: inline-block; border: 1px solid var(--borda); }
.amostra.ferias { background: var(--ferias); }
.amostra.recesso { background: repeating-linear-gradient(45deg, var(--recesso) 0 3px, transparent 3px 6px); }
.amostra.fds { background: var(--fds); }
.amostra.feriado { background: var(--feriado); }
.amostra.facultativo { background: var(--facultativo); }
.amostra.calor { background: rgba(var(--calor-rgb), 0.7); }

/* ===== Gantt ===== */
.gantt { overflow: auto; max-height: 75vh; border: 1px solid var(--borda); border-radius: 10px; background: var(--superficie); }
.gantt-grade { position: relative; width: calc(var(--rotulo) + var(--trilha)); }
.gantt-fundo { position: absolute; top: 0; bottom: 0; left: var(--rotulo); width: var(--trilha); pointer-events: none; }
.faixa { position: absolute; top: 0; bottom: 0; }
.faixa.fds { background: var(--fds); }
.faixa.feriado { background: var(--feriado); }
.faixa.facultativo { background: var(--facultativo); }
.linha { display: flex; min-height: 28px; border-bottom: 1px solid var(--borda-suave); position: relative; }
.rotulo { position: sticky; left: 0; z-index: 2; width: var(--rotulo); flex: none; background: var(--superficie); padding: 4px 8px; border: 0; border-right: 1px solid var(--borda); font: inherit; color: var(--texto); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rotulo-proc { cursor: pointer; }
.trilha { position: relative; width: var(--trilha); flex: none; }
.cabecalho { position: sticky; top: 0; z-index: 3; min-height: 40px; background: var(--superficie); }
.mes { position: absolute; top: 0; height: 20px; border-left: 1px solid var(--borda); font-size: 12px; padding-left: 4px; white-space: nowrap; overflow: hidden; }
.num-dia { position: absolute; top: 20px; height: 20px; font-size: 11px; text-align: center; color: var(--texto-suave); }
.setor-titulo, .setor-titulo .rotulo { background: var(--superficie-2); font-weight: 600; }
.barra { position: absolute; top: 5px; height: 18px; border-radius: 4px; border: 0; padding: 0; }
.barra.ferias { background: var(--ferias); cursor: pointer; }
.barra.recesso { background: repeating-linear-gradient(45deg, var(--recesso) 0 4px, transparent 4px 8px); border: 1px solid var(--recesso); }
.ocupacao .rotulo { font-size: 0.8rem; color: var(--texto-suave); }
.celula { position: absolute; top: 0; bottom: 0; font-size: 11px; display: flex; align-items: center; justify-content: center; }

/* ===== Formulário de férias ===== */
.periodos { padding-left: 20px; display: grid; gap: 10px; margin: 0; }
.periodo .campos { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
.periodo .dias { padding-bottom: 8px; min-width: 60px; }
.colegas { margin: 4px 0 0; font-size: 0.85rem; color: var(--texto-suave); }
.contador { font-weight: 600; margin: 0; }
.contador.completo { color: var(--ok); }
.contador.excedido { color: var(--erro); }
.erros { color: var(--erro); margin: 0; }
fieldset.recesso { border: 1px solid var(--borda); border-radius: 8px; }
.radio { display: flex; gap: 6px; align-items: center; font-weight: 400; }
.cabecalho-editor { display: flex; justify-content: space-between; align-items: center; gap: 8px; }

/* ===== Admin ===== */
.barra-acoes { display: flex; gap: 8px; margin-bottom: 12px; }
.tabela-rolavel { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--borda-suave); vertical-align: top; }
td.conflito { color: var(--erro); }
.grade-recesso { display: grid; grid-template-columns: auto 1fr 1fr; gap: 8px; align-items: center; max-width: 480px; }

.dialogo { border: 1px solid var(--borda); border-radius: 10px; background: var(--superficie); color: var(--texto); max-width: 420px; }

@media (max-width: 600px) {
  :root { --rotulo: 120px; }
  .pagina { padding: 12px; }
}
```

- [ ] **Step 3: Criar `src/api/index.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import { criarApi, type ClienteRpc } from './rpc';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurado = Boolean(url && chave);

const semConfiguracao: ClienteRpc = {
  rpc: async () => ({
    data: null,
    error: { message: 'App não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).', code: 'CONFIG' },
  }),
};

export const api = criarApi(
  configurado
    ? (createClient(url!, chave!, { auth: { persistSession: false } }) as unknown as ClienteRpc)
    : semConfiguracao,
);
```

- [ ] **Step 4: Criar `src/ui/formFerias.ts`**

```ts
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
```

- [ ] **Step 5: Criar `src/ui/telaPrincipal.ts`**

```ts
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
```

- [ ] **Step 6: Criar `src/ui/editor.ts`**

```ts
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
```

- [ ] **Step 7: Criar `src/main.ts`**

```ts
import './styles.css';
import { api, configurado } from './api';
import { mensagemDe } from './api/rpc';
import type { DadosPublicos } from './lib/tipos';
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
  else if (rota === '/admin') raiz.replaceChildren(h('main', { class: 'pagina' }, aviso('info', 'Administração em construção.')));
  else montarTelaPrincipal(raiz, dados);
}

window.addEventListener('hashchange', () => { void rotear(); });
void rotear();
```

- [ ] **Step 8: Criar `scripts/dados-exemplo.mjs`**

```js
// Popula o projeto de DEV (o mesmo dos testes de integração) com dados fictícios para ver a interface.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = loadEnv('test', process.cwd(), '');
if (!env.SUPABASE_TEST_URL || !env.SUPABASE_TEST_SERVICE_KEY) {
  console.error('Defina SUPABASE_TEST_URL e SUPABASE_TEST_SERVICE_KEY em .env.test.local');
  process.exit(1);
}
const c = createClient(env.SUPABASE_TEST_URL, env.SUPABASE_TEST_SERVICE_KEY, { auth: { persistSession: false } });

async function ok(p) {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

await ok(c.from('sessoes').delete().neq('token', ''));
await ok(c.from('periodos_ferias').delete().gte('id', 0));
await ok(c.from('procuradores').delete().gte('id', 0));
await ok(c.from('setores').delete().gte('id', 0));

const setores = await ok(c.from('setores').insert([
  { nome: 'Graduação', ordem: 1 },
  { nome: 'Pós-Graduação', ordem: 2 },
  { nome: 'Extensão', ordem: 3 },
]).select('id, nome'));
const setor = nome => setores.find(s => s.nome === nome).id;

const procs = await ok(c.from('procuradores').insert([
  { nome: 'Ana Souza', setor_id: setor('Graduação'), recesso: 'natal' },
  { nome: 'Bruno Lima', setor_id: setor('Graduação'), recesso: 'ano_novo' },
  { nome: 'Carla Dias', setor_id: setor('Graduação'), recesso: 'natal' },
  { nome: 'Davi Rocha', setor_id: setor('Pós-Graduação'), recesso: 'ano_novo' },
  { nome: 'Elisa Prado', setor_id: setor('Pós-Graduação'), recesso: 'natal' },
  { nome: 'Fábio Nunes', setor_id: setor('Extensão'), recesso: null },
  { nome: 'Gabriela Melo', setor_id: setor('Extensão'), recesso: 'ano_novo' },
]).select('id, nome'));
const proc = nome => procs.find(p => p.nome === nome).id;

await ok(c.from('periodos_ferias').insert([
  { procurador_id: proc('Ana Souza'), inicio: '2027-01-11', fim: '2027-01-25' },
  { procurador_id: proc('Ana Souza'), inicio: '2027-07-05', fim: '2027-07-19' },
  { procurador_id: proc('Bruno Lima'), inicio: '2027-01-18', fim: '2027-02-01' },
  { procurador_id: proc('Carla Dias'), inicio: '2027-07-12', fim: '2027-07-26' },
  { procurador_id: proc('Davi Rocha'), inicio: '2027-03-01', fim: '2027-03-30' },
  { procurador_id: proc('Elisa Prado'), inicio: '2027-03-15', fim: '2027-03-29' },
  { procurador_id: proc('Fábio Nunes'), inicio: '2027-10-04', fim: '2027-10-18' },
]));
await ok(c.rpc('_teste_definir_admin', { p_senha: 'admin-dev-123' }));
console.log('Dados de exemplo carregados. Senha admin de dev: admin-dev-123');
```

- [ ] **Step 9: Verificar build e testes**

Run: `rtk npm test` e `rtk npm run build`
Expected: testes PASS; build gera `dist/` sem erros de tipo.

- [ ] **Step 10: Verificação manual no navegador**

Run: `rtk npm run dados:exemplo` e depois `rtk npm run dev` (em background)
Abrir `http://localhost:5173/` e conferir:
1. Gantt mostra os 3 setores, barras azuis de férias, recesso hachurado, fins de semana e feriados sombreados; zoom Ano/Trimestre/Mês muda a largura; filtro de setor funciona.
2. A faixa "Presentes no setor" fica mais vermelha em 18–25/01 na Graduação; ao passar o mouse aparece "x/3 presentes — fora: …".
3. Clicar numa barra abre o diálogo com os períodos.
4. "Marcar minhas férias" → Graduação → Ana Souza → criar PIN `1234` (confirmação) → editor mostra 30/30 e status completo.
5. Adicionar um período que estoure 30 dias → erro "Soma ultrapassa 30 dias (…)" e botão Salvar desabilitado.
6. Remover um período, salvar → "Férias salvas com sucesso."; voltar ao calendário e ver a mudança.
7. Recarregar a página em `#/marcar` → continua logado (sessão no localStorage).
8. Com o navegador em tema escuro, as cores continuam legíveis; em largura de celular (≈375 px) não há rolagem horizontal da página (só dentro do Gantt).
Se algum item falhar, corrigir antes do commit.

- [ ] **Step 11: Commit**

```bash
rtk git add index.html src scripts/dados-exemplo.mjs
rtk git commit -m "feat: tela principal com Gantt e fluxo de marcação de férias"
```

---

### Task 11: Painel do administrador

**Files:**
- Create: `src/ui/admin.ts`
- Modify: `src/main.ts` (rota `/admin`)
- Test: verificação manual no navegador (Step 4) + `rtk npm run build`

**Interfaces:**
- Consumes: `api`, `ErroApi`, `mensagemDe` (Task 7/10); `lerSessao`/`gravarSessao`/`limparSessao`, `h`, `aviso` (Task 9); `formularioFerias`, `EstadoFerias` (Task 10); `gerarCsv` (Task 4); `validarMarcacao`, `statusProcurador`, `totalDias` (Task 2); `setoresOrdenados`, `procuradoresDoSetor`, `periodosDe` (Task 3).
- Produces: `montarAdmin(raiz: HTMLElement, inicial: DadosPublicos, recarregar: () => Promise<DadosPublicos>): void`.

- [ ] **Step 1: Criar `src/ui/admin.ts`**

```ts
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
```

- [ ] **Step 2: Ligar a rota em `src/main.ts`**

Adicionar o import junto aos outros:

```ts
import { montarAdmin } from './ui/admin';
```

E trocar a linha da rota provisória:

```ts
  else if (rota === '/admin') raiz.replaceChildren(h('main', { class: 'pagina' }, aviso('info', 'Administração em construção.')));
```

por:

```ts
  else if (rota === '/admin') montarAdmin(raiz, dados, recarregar);
```

- [ ] **Step 3: Verificar build e testes**

Run: `rtk npm test` e `rtk npm run build`
Expected: PASS; build sem erros.

- [ ] **Step 4: Verificação manual no navegador**

Run: `rtk npm run dados:exemplo` e `rtk npm run dev`
Em `http://localhost:5173/#/admin`:
1. Senha errada → "Senha incorreta."; senha `admin-dev-123` → painel.
2. Status lista os 7 Procuradores; Ana Souza e Davi Rocha aparecem "completo"; Fábio Nunes sem recesso aparece "pendente".
3. Adicionar ponto facultativo 08/02/2027 "Carnaval" → aparece na lista e sombreado no calendário.
4. Mudar o recesso Ano-Novo para 27/12/2026–19/01/2027 → Bruno Lima aparece com "⚠ Período 1 sobrepõe o recesso escolhido."; restaurar 27/12/2026–02/01/2027.
5. "Editar férias" de Fábio Nunes → escolher recesso Natal → Salvar → status "completo"? (Fábio tem 15 dias: deve continuar "pendente".)
6. Criar setor "Teste", criar Procurador "Zé" nele, inativar Zé (some do calendário), excluir Zé, excluir setor "Teste".
7. Criar PIN para Carla Dias em `#/marcar`, depois "Resetar PIN" no admin → Carla volta a "primeiro acesso".
8. Exportar CSV → abrir no Excel: acentos corretos, colunas separadas.
9. Trocar a senha e entrar com a nova; depois rodar `rtk npm run dados:exemplo` para restaurar a senha de dev.
Corrigir qualquer falha antes do commit.

- [ ] **Step 5: Commit**

```bash
rtk git add src/ui/admin.ts src/main.ts
rtk git commit -m "feat: painel do administrador"
```

---

### Task 12: Deploy (GitHub Pages), keep-alive e README

**Files:**
- Create: `.github/workflows/deploy.yml`, `.github/workflows/keep-alive.yml`, `README.md`

**Interfaces:**
- Consumes: scripts `test`, `build`, `db:push:prod` (Tasks 1, 6); RPC `ping` (Task 6).
- Produces: site publicado em `https://<usuario>.github.io/<repo>/`; secrets do repositório `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (produção) e, opcionalmente, `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` (dev, só para o keep-alive).

- [ ] **Step 1: Criar `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Criar `.github/workflows/keep-alive.yml`**

```yaml
# Evita a pausa por inatividade do Supabase Free e reativa o próprio agendamento,
# que o GitHub desliga após 60 dias sem atividade no repositório.
name: Keep-alive Supabase

on:
  schedule:
    - cron: '0 12 */3 * *'
  workflow_dispatch:

permissions:
  actions: write

jobs:
  ping:
    runs-on: ubuntu-latest
    env:
      PROD_URL: ${{ secrets.VITE_SUPABASE_URL }}
      PROD_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      DEV_URL: ${{ secrets.SUPABASE_TEST_URL }}
      DEV_KEY: ${{ secrets.SUPABASE_TEST_ANON_KEY }}
    steps:
      - name: Ping produção
        run: |
          curl -fsS -X POST "$PROD_URL/rest/v1/rpc/ping" \
            -H "apikey: $PROD_KEY" -H "Content-Type: application/json" -d '{}'
      - name: Ping dev
        if: env.DEV_URL != ''
        run: |
          curl -fsS -X POST "$DEV_URL/rest/v1/rpc/ping" \
            -H "apikey: $DEV_KEY" -H "Content-Type: application/json" -d '{}'
      - name: Manter o agendamento ativo
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh api -X PUT "repos/${{ github.repository }}/actions/workflows/keep-alive.yml/enable"
```

- [ ] **Step 3: Criar `README.md`**

````markdown
# Marca Férias — Núcleo de Educação EFIN1

App para os Procuradores marcarem as férias de 2027 e o recesso 2026/2027, com calendário em barras mostrando choques e quantas pessoas ficam em cada setor.

- Front-end: Vite + TypeScript, publicado no GitHub Pages.
- Banco: Supabase (plano gratuito). Todo acesso passa por funções RPC com PIN/senha.

## Uso

- **Procurador:** abre o link → "Marcar minhas férias" → setor → nome → cria um PIN (1º acesso) → marca os períodos (até 30 dias somados) e escolhe o recesso.
- **Administrador:** link "Administração" no rodapé (`#/admin`). Cadastra setores e Procuradores, pontos facultativos, datas do recesso, reseta PINs, edita marcações e exporta CSV.

## Configuração inicial (uma vez)

### 1. Supabase de produção
1. Em https://supabase.com, crie o projeto `marca-ferias` (região São Paulo).
2. Crie `.env.production.local` (não vai para o Git):
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<chave anon/publishable>
   SUPABASE_PROD_DB_URL=postgresql://postgres.<ref>:<SENHA_URL_ENCODED>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
   ```
   (URL em *Connect → Session pooler*; caracteres especiais da senha devem ser codificados, ex.: `@` → `%40`.)
3. Aplique as migrations: `npm run db:push:prod`.
4. Defina a senha de administrador no *SQL Editor* do Supabase:
   ```sql
   update config set admin_hash = extensions.crypt('SUA-SENHA-FORTE', extensions.gen_salt('bf')) where id;
   ```

### 2. GitHub
1. Crie um repositório **público** e faça push da branch `main`.
2. *Settings → Pages → Source*: **GitHub Actions**.
3. *Settings → Secrets and variables → Actions*, crie:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (produção);
   - opcional: `SUPABASE_TEST_URL` e `SUPABASE_TEST_ANON_KEY` (dev, para o keep-alive).
4. O workflow **Deploy** publica a cada push; o endereço aparece em *Settings → Pages*.

### 3. Primeiros cadastros
No `#/admin`: cadastre os setores, depois os Procuradores, e os pontos facultativos de 2027. Confira as datas do recesso.

## Manutenção

- **Keep-alive:** o workflow *Keep-alive Supabase* chama o banco a cada 3 dias para o Supabase não pausar o projeto.
- **Se o projeto pausar mesmo assim:** entre em supabase.com/dashboard, abra o projeto e clique em **Restore project** (alguns minutos; os dados ficam intactos).
- **Procurador esqueceu o PIN:** `#/admin` → Status → "Resetar PIN".

## Desenvolvimento

```bash
npm install
npm test                  # testes unitários
npm run test:integration  # testes contra o projeto Supabase de DEV (APAGA os dados dele)
npm run db:push:test      # aplica migrations no DEV
npm run dados:exemplo     # popula o DEV com dados fictícios (senha admin: admin-dev-123)
npm run dev               # http://localhost:5173
```

Variáveis: veja `.env.example`. Use `.env.local` (dev) e `.env.test.local` (testes) apontando para o projeto **de dev** — nunca para produção.
````

- [ ] **Step 4: Verificar**

Run: `rtk npm test` e `rtk npm run build`
Expected: PASS; build OK.

- [ ] **Step 5: Commit**

```bash
rtk git add .github README.md
rtk git commit -m "chore: deploy no GitHub Pages, keep-alive do Supabase e README"
```

- [ ] **Step 6: [Humano] Produção**

Pedir ao usuário (seguindo o README):
1. Criar o projeto Supabase de produção e o `.env.production.local`.
2. Executor roda `rtk npm run db:push:prod`.
3. Usuário define a senha admin no SQL Editor.
4. Usuário cria o repositório público no GitHub; executor adiciona o remote e faz `rtk git push -u origin main` **somente após confirmação explícita do usuário**.
5. Usuário configura Pages (GitHub Actions) e os secrets; executor dispara/acompanha o workflow com `rtk gh run watch`.
6. Executor roda manualmente o *Keep-alive* (`rtk gh workflow run keep-alive.yml`) e confirma sucesso com `rtk gh run list --workflow keep-alive.yml`.
7. Abrir o site publicado, entrar no `#/admin` e confirmar que carrega (sem cadastros ainda).
