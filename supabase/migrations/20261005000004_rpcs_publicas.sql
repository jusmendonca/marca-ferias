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
