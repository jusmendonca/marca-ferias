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
