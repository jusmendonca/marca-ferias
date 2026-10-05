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
