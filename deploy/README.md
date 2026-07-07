# Deploy — checklist

Nada aqui foi executado ainda. Nenhum VPS foi comprado, nenhum domínio registrado, nenhum
DNS mudado. Esses arquivos deixam o deploy pronto pra quando você decidir a infra.

## Arquivos prontos

- `Dockerfile` (raiz da API) — imagem Node 20 alpine, produção.
- `docker-compose.prod.yml` (raiz da API) — API + Postgres num VPS só. Banco NÃO expõe
  porta pro host (só a API acessa, via rede interna do Docker).
- `.env.prod.example` (raiz da API) — copiar para `.env.prod` e preencher segredos reais.
- `../clube-boa-forma-app/deploy/nginx.conf.example` — serve o front estático (dist/) +
  proxy reverso pra API. Precisa trocar `SEUDOMINIO` e gerar certificados TLS.

## Passo a passo (quando decidir a infra)

1. **Provisionar o VPS** (qualquer provedor — Hostinger, DigitalOcean, etc.), Ubuntu/Debian,
   instalar Docker + Docker Compose + nginx + certbot.
2. **Domínio**: apontar `app.SEUDOMINIO.com.br` e `api.SEUDOMINIO.com.br` (registros A) pro
   IP do VPS.
3. **Copiar o código pro VPS** (git clone ou rsync) das duas pastas: `clube-boa-forma-api`
   e `clube-boa-forma-app`.
4. **Backend**:
   - `cp .env.prod.example .env.prod` e preencher (senha do Postgres, JWT_SECRET/QR_SECRET
     gerados com `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
     CORS_ORIGIN = `https://app.SEUDOMINIO.com.br`, VAPID keys).
   - `docker compose -f docker-compose.prod.yml up -d --build`
   - Rodar migrations dentro do container: `docker compose -f docker-compose.prod.yml exec api npx knex migrate:latest`
     (usa `DATABASE_URL`, o superusuário — cria inclusive a role `clube_app` via
     `0003_app_role.js`, ver [[backend_decisoes]]/SECURITY.md sobre por que a API roda com
     a role sem privilégio de superusuário).
5. **Frontend**:
   - `npm run build` local ou no VPS (gera `dist/`).
   - Copiar `dist/` para `/var/www/clube-boa-forma-app/dist` no VPS (ajustar path se
     diferente do nginx.conf).
   - Antes do build, checar `.env.production` do front aponta a API real
     (`VITE_API_URL=https://api.SEUDOMINIO.com.br` ou equivalente — conferir nome exato da
     env var em `src/services/http.ts` / `.env.example` do front).
6. **Nginx**: copiar `nginx.conf.example` preenchido pra
   `/etc/nginx/sites-available/clube-boa-forma`, symlink pra `sites-enabled`, rodar certbot
   pra cada domínio (`certbot --nginx -d app.SEUDOMINIO.com.br` e idem pra `api.`), depois
   `nginx -t && systemctl reload nginx`.
7. **Firewall**: liberar só 80/443 (e SSH) no VPS; a porta 3333 da API só precisa estar
   acessível localmente pro nginx (já é o caso, o compose só expõe pro host, não pra rede
   externa direto — mas se preferir mais isolamento, pode tirar o `ports:` do serviço `api`
   e falar com o nginx via rede docker também).

## Pendências que bloqueiam produção de verdade

- Fase 1 do pivot SaaS (cobrança/Asaas) — sem isso, cadastro de academia é manual.
- CORS_ORIGIN, domínio, e infraestrutura ainda são só placeholders neste README.
- Nenhum backup automático configurado ainda (considerar `pg_dump` agendado + storage
  externo antes de colocar academias reais em produção).
