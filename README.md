# Marca Férias — Núcleo de Educação EFIN1

App para os Procuradores marcarem as férias de 2027 e o recesso 2026/2027, com calendário em barras mostrando choques e quantas pessoas ficam em cada setor.

- Front-end: Vite + TypeScript, publicado no GitHub Pages.
- Banco: Supabase (plano gratuito). Todo acesso passa por funções RPC com PIN/senha.

## Uso

- **Procurador:** abre o link → "Marcar minhas férias" → setor → nome → cria um PIN (1º acesso) → marca os períodos (até 30 dias somados) e escolhe o recesso.
- **Administrador:** link "Administração" no rodapé (`#/admin`). Cadastra setores e Procuradores, pontos facultativos, datas do recesso, reseta PINs, edita marcações e exporta CSV.

## Configuração inicial (uma vez)

### 1. Supabase de produção

1. Em https://supabase.com, crie o projeto `marca-ferias` (região São Paulo). Na tela de criação, desmarque "Automatically expose new tables".
2. Aplique as migrations, **na ordem**, arquivo por arquivo de `supabase/migrations/` (`...0001` a `...0005`), de uma destas formas:
   - **SQL Editor (sem senha do banco):** abra *SQL Editor → New query*, cole o conteúdo de cada arquivo e clique em **Run**. O Supabase avisa sobre "operações destrutivas" por causa dos `delete` dentro das funções; pode confirmar.
   - **CLI:** crie `.env.production.local` com `SUPABASE_PROD_DB_URL=postgresql://postgres.<ref>:<SENHA_URL_ENCODED>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres` (*Connect → Session pooler*; codifique caracteres especiais da senha, ex.: `@` → `%40`) e rode `npm run db:push:prod`.
3. Defina a senha de administrador no *SQL Editor*:
   ```sql
   update config set admin_hash = extensions.crypt('SUA-SENHA-FORTE', extensions.gen_salt('bf')) where id;
   ```
4. Anote, em *Project Settings → API Keys → Legacy anon, service_role API keys*, a **URL do projeto** e a chave **anon**. Nunca use a `service_role` no front-end nem em secrets do GitHub.

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
npm run db:push:test      # aplica migrations no DEV (ou cole os SQLs no SQL Editor)
npm run dados:exemplo     # popula o DEV com dados fictícios (senha admin: admin-dev-123)
npm run dev               # http://localhost:5173
```

Variáveis: veja `.env.example`. Use `.env.local` (dev) e `.env.test.local` (testes) apontando para o projeto **de dev** — nunca para produção.
