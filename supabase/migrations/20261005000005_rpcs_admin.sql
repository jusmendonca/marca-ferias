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
