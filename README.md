# Marca Férias — Núcleo de Educação EFIN1

App para os Procuradores marcarem as férias de 2027 e o recesso 2026/2027, com calendário em barras mostrando choques e quantas pessoas ficam em cada setor.

- **Site:** https://jusmendonca.github.io/marca-ferias/
- **Administração:** o mesmo endereço, com `#/admin` no final.
- Front-end: Vite + TypeScript, publicado no GitHub Pages.
- Banco: Supabase (plano gratuito). Todo acesso passa por funções RPC com PIN/senha.

---

# Como manter o sistema no ar

O sistema é gratuito e depende de **duas peças**: o **Supabase** (banco) e o **GitHub** (site e rotina automática). Na maior parte do tempo ele se cuida sozinho. O que pode derrubá-lo está listado abaixo.

## O que pode derrubar, e o que já está protegido

| Risco | Proteção | Seu papel |
|---|---|---|
| **Supabase pausa o banco** após cerca de 7 dias sem uso (plano gratuito) | O workflow *Keep-alive Supabase* chama o banco a cada 3 dias | Conferir todo mês que ele está rodando (abaixo) |
| **GitHub desliga o keep-alive** depois de 60 dias sem atividade no repositório | O próprio workflow se reativa a cada execução | Se aparecer o aviso de "disabled", reativar (abaixo) |
| **Perda de dados** (o plano gratuito **não tem backup** que você consiga restaurar) | Nenhuma automática | **Exportar o CSV** pelo admin de tempos em tempos |
| **Chaves ou senhas trocadas** | Nenhuma | Atualizar os secrets do GitHub e refazer o deploy |

## Rotina mensal (5 minutos)

1. **Keep-alive.** Abra https://github.com/jusmendonca/marca-ferias/actions e clique em **Keep-alive Supabase**. As últimas execuções devem estar verdes, com datas de no máximo 3 dias atrás.
   - Se aparecer *"This scheduled workflow is disabled because there hasn't been activity in this repository for at least 60 days"*, clique em **Enable workflow**. Alternativa: faça qualquer commit no repositório.
   - Se estiver vermelho, abra a execução e leia o log (veja "Quando algo quebrar").
2. **Site.** Abra https://jusmendonca.github.io/marca-ferias/ e veja se o calendário carrega.
3. **Backup.** Entre no `#/admin`, clique em **Exportar CSV** e guarde o arquivo (nuvem do trabalho, por exemplo). É a única cópia dos dados fora do Supabase.

## Durante a campanha de marcação

- Exporte o CSV **no dia do prazo** e de novo **quando a última pessoa completar**. Depois disso, o mês seguinte já basta.
- Quem esquecer o PIN: `#/admin` → seção **Status** → **Resetar PIN**. A pessoa cria outro no próximo acesso.
- Quem errar o PIN 5 vezes fica bloqueado por 15 minutos, e o bloqueio dobra a cada rodada (30 min, 1 h, até 16 h). O reset do admin zera tudo.
- Se alguém digitar um PIN e depois reclamar que "não entra", confira se o nome é o certo (existe uma pessoa por nome) antes de resetar.

## Quando algo quebrar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Site abre, mas mostra **"Não foi possível conectar"** | Banco **pausado** | https://supabase.com/dashboard → projeto **marca-ferias** → **Restore project**. Espere 2 a 5 minutos. Os dados ficam intactos. |
| Site dá **404** ou não abre | Deploy falhou ou Pages desligado | Actions → **Deploy** → **Re-run all jobs**. Confira em *Settings → Pages → Source* que está **GitHub Actions**. |
| Keep-alive **vermelho**, log com `401` ou `Invalid API key` | Chave do Supabase mudou | Atualize os secrets (abaixo) |
| Keep-alive **vermelho**, log com erro de conexão ou `503` | Banco pausado | **Restore project** (linha acima) |
| **Esqueceu a senha do admin** | — | Rode o SQL abaixo no *SQL Editor* de produção |
| Mudou as chaves do Supabase | — | Atualize os secrets (abaixo) |

**Trocar a senha do admin pelo SQL** (quando esquecer; com a senha atual, use o próprio painel):

```sql
update config set admin_hash = extensions.crypt('NOVA-SENHA-FORTE', extensions.gen_salt('bf')),
                  admin_falhas = 0, admin_bloqueado_ate = null
where id;
```

**Atualizar os secrets do GitHub** (depois de trocar as chaves do Supabase): em *Settings → Secrets and variables → Actions*, edite `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave **anon** (nunca a `service_role`). Depois vá em Actions → **Deploy** → **Run workflow**.

**Se o projeto ficar pausado por muito tempo** (hoje, mais de 90 dias, mas confira nas regras do Supabase), ele deixa de poder ser restaurado. Por isso o CSV mensal importa.

## O que não fazer

- **Não** rode `npm run test:integration` apontando para produção: os testes **apagam todos os dados**. O arquivo `.env.production.local` faz os testes se recusarem a rodar contra a URL de produção; não o apague.
- **Não** coloque a chave `service_role` em lugar nenhum: nem no repositório, nem nos secrets, nem no site.
- **Não** commite nomes de Procuradores nem dados reais: o repositório é **público**.
- **Não** renomeie nem apague o repositório `marca-ferias`: o endereço do site muda ou deixa de existir.
- **Não** use `npm run db:push:prod` em um projeto cujas migrations foram aplicadas pelo SQL Editor: o CLI não tem o histórico e tenta recriar as tabelas.
- **Não** apague o projeto `marca-ferias` do Supabase. O `marca-ferias-dev` é só de testes e pode pausar à vontade: se quiser rodar os testes de novo, faça **Restore project** nele antes.

## Ano que vem

O app está **fixo em 2027**: as datas do ano (01/01/2027 a 31/12/2027), o intervalo do calendário (21/12/2026 a 31/12/2027) e os feriados do seed são fixos no código (`src/lib/regras.ts`, `src/lib/escala.ts` e a função `_salvar_ferias` no banco). Para uma nova campanha, é preciso alterar o código e o banco; não basta mudar configuração.

---

# Como usar

- **Procurador:** abre o link → "Marcar minhas férias" → setor → nome → cria um PIN (1º acesso) → marca os períodos (até 30 dias corridos somados) e escolhe o recesso.
- **Administrador:** link "Administração" no rodapé (`#/admin`). Cadastra setores e Procuradores, pontos facultativos, datas do recesso, reseta PINs, edita marcações e exporta CSV.

---

# Configuração inicial (já feita; fica de referência)

### 1. Supabase de produção

1. Em https://supabase.com, crie o projeto `marca-ferias` (região São Paulo). Na tela de criação, desmarque "Automatically expose new tables".
2. Aplique as migrations, **na ordem**, arquivo por arquivo de `supabase/migrations/` (`...0001` a `...0006`), de uma destas formas:
   - **SQL Editor (sem senha do banco):** abra *SQL Editor → New query*, cole o conteúdo de cada arquivo e clique em **Run**. O Supabase avisa sobre "operações destrutivas" por causa dos `delete` dentro das funções; pode confirmar.
   - **CLI:** crie `.env.production.local` com `SUPABASE_PROD_DB_URL=postgresql://postgres.<ref>:<SENHA_URL_ENCODED>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres` (*Connect → Session pooler*; codifique caracteres especiais da senha, ex.: `@` → `%40`) e rode `npm run db:push:prod`.
3. Defina a senha de administrador no *SQL Editor*:
   ```sql
   update config set admin_hash = extensions.crypt('SUA-SENHA-FORTE', extensions.gen_salt('bf')) where id;
   ```
4. Anote a **URL do projeto** e a chave pública em *Project Settings → API Keys*. Em projetos novos, a aba **Legacy anon, service_role API keys** traz a chave `anon`; a *publishable key* (`sb_publishable_…`) também funciona em `VITE_SUPABASE_ANON_KEY`. Nunca use a `service_role` no front-end nem em secrets do GitHub.

### 2. GitHub

1. Crie um repositório **público** e faça push da branch `main`.
2. *Settings → Pages → Source*: **GitHub Actions**.
3. *Settings → Secrets and variables → Actions*, crie:
   - `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (produção);
   - opcional: `SUPABASE_TEST_URL` e `SUPABASE_TEST_ANON_KEY` (dev, para o keep-alive do projeto de testes).
4. O workflow **Deploy** publica a cada push; o endereço aparece em *Settings → Pages*.

### 3. Primeiros cadastros

No `#/admin`: cadastre os setores, depois os Procuradores, e os pontos facultativos de 2027. Confira as datas do recesso.

---

# Desenvolvimento

```bash
npm install
npm test                  # testes unitários
npm run test:integration  # testes contra o projeto Supabase de DEV (APAGA os dados dele)
npm run db:push:test      # aplica migrations no DEV (ou cole os SQLs no SQL Editor)
npm run dados:exemplo     # popula o DEV com dados fictícios (senha admin: admin-dev-123)
npm run dev               # http://localhost:5173
```

Variáveis: veja `.env.example`. Use `.env.local` (dev) e `.env.test.local` (testes) apontando para o projeto **de dev** — nunca para produção.
