-- Bloqueio progressivo de PIN (15 min, 30 min, 1 h … até 16 h) e bloqueio do login de admin.

alter table procuradores add column bloqueios_seguidos int not null default 0;
alter table config add column admin_falhas int not null default 0;
alter table config add column admin_bloqueado_ate timestamptz;

create or replace function entrar(p_procurador_id bigint, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v procuradores;
  v_minutos int;
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
      v_minutos := 15 * (2 ^ least(v.bloqueios_seguidos, 6))::int;
      update procuradores
         set tentativas_falhas = 0, bloqueios_seguidos = v.bloqueios_seguidos + 1,
             bloqueado_ate = now() + make_interval(mins => v_minutos)
       where id = v.id;
      return jsonb_build_object('ok', false, 'erro', format('PIN incorreto. Bloqueado por %s minutos.', v_minutos));
    end if;
    update procuradores set tentativas_falhas = tentativas_falhas + 1 where id = v.id;
    return jsonb_build_object('ok', false, 'erro',
      format('PIN incorreto — %s tentativa(s) restante(s).', 5 - (v.tentativas_falhas + 1)));
  end if;
  update procuradores set tentativas_falhas = 0, bloqueios_seguidos = 0, bloqueado_ate = null where id = v.id;
  return jsonb_build_object('ok', true, 'token', _novo_token(v.id, false));
end $$;

create or replace function admin_resetar_pin(p_token text, p_procurador_id bigint) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _exigir_admin(p_token);
  update procuradores
     set pin_hash = null, tentativas_falhas = 0, bloqueios_seguidos = 0, bloqueado_ate = null
   where id = p_procurador_id;
  if not found then
    raise exception 'Procurador não encontrado.';
  end if;
  delete from sessoes where procurador_id = p_procurador_id;
end $$;

-- Login do admin: 5 erros bloqueiam por 15 min (valor fixo, para um atacante não trancar o admin por dias).
-- Sem pg_sleep: o bloqueio impede a tentativa antes mesmo de rodar o bcrypt.
create or replace function admin_entrar(p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  c config;
begin
  select * into c from config for update;
  if c.admin_hash is null then
    return jsonb_build_object('ok', false, 'erro', 'Senha de administrador não configurada.');
  end if;
  if c.admin_bloqueado_ate is not null and c.admin_bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'erro',
      'Bloqueado até ' || to_char(c.admin_bloqueado_ate at time zone 'America/Sao_Paulo', 'HH24:MI') || '.');
  end if;
  if crypt(coalesce(p_senha, ''), c.admin_hash) <> c.admin_hash then
    if c.admin_falhas + 1 >= 5 then
      update config set admin_falhas = 0, admin_bloqueado_ate = now() + interval '15 minutes' where id;
      return jsonb_build_object('ok', false, 'erro', 'Senha incorreta. Bloqueado por 15 minutos.');
    end if;
    update config set admin_falhas = admin_falhas + 1 where id;
    return jsonb_build_object('ok', false, 'erro', 'Senha incorreta.');
  end if;
  update config set admin_falhas = 0, admin_bloqueado_ate = null where id;
  return jsonb_build_object('ok', true, 'token', _novo_token(null, true));
end $$;

create or replace function _teste_definir_admin(p_senha text) returns void
language sql security definer set search_path = public, extensions as $$
  update config set admin_hash = crypt(p_senha, gen_salt('bf')), admin_falhas = 0, admin_bloqueado_ate = null where id;
$$;
