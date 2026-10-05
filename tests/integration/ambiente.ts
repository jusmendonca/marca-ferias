import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_KEY;
if (!url || !anon || !service) {
  throw new Error('Defina SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY e SUPABASE_TEST_SERVICE_KEY em .env.test.local');
}

/** Lê VITE_SUPABASE_URL só dos arquivos de produção (.env.local é do projeto de dev e não conta). */
function urlDeProducao(): string | undefined {
  for (const arquivo of ['.env.production.local', '.env.production']) {
    if (!existsSync(arquivo)) continue;
    const m = readFileSync(arquivo, 'utf8').match(/^VITE_SUPABASE_URL=(.+)$/m);
    if (m) return m[1].trim();
  }
  return undefined;
}
const urlProducao = urlDeProducao();
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
    { nome: 'Ana', setor_id: setorA, ativo: true },
    { nome: 'Bruno', setor_id: setorA, ativo: true },
    { nome: 'Inativo', setor_id: setorA, ativo: false },
  ]).select('id, nome'));
  const id = (nome: string) => procs!.find(p => p.nome === nome)!.id as number;

  return { setorA, setorB, ana: id('Ana'), bruno: id('Bruno'), inativo: id('Inativo') };
}
