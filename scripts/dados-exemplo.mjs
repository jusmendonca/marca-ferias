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
  { nome: 'Ana Souza', setor_id: setor('Graduação'), recesso: 'natal', ativo: true },
  { nome: 'Bruno Lima', setor_id: setor('Graduação'), recesso: 'ano_novo', ativo: true },
  { nome: 'Carla Dias', setor_id: setor('Graduação'), recesso: 'natal', ativo: true },
  { nome: 'Davi Rocha', setor_id: setor('Pós-Graduação'), recesso: 'ano_novo', ativo: true },
  { nome: 'Elisa Prado', setor_id: setor('Pós-Graduação'), recesso: 'natal', ativo: true },
  { nome: 'Fábio Nunes', setor_id: setor('Extensão'), recesso: null, ativo: true },
  { nome: 'Gabriela Melo', setor_id: setor('Extensão'), recesso: 'ano_novo', ativo: true },
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
