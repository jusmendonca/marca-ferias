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
