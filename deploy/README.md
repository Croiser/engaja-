# Deploy — Engaja+ (produção)

Deploy real feito em 07/07/2026 no VPS da Hostinger que o Douglas já usa pra outros
projetos (`dodile.com.br`), via API da Hostinger (MCP), sem acesso SSH direto — ver
detalhes técnicos e decisões em [[saas_pivot]] (memória do projeto).

## Onde está

- **VPS**: Hostinger KVM 2, IP `187.77.45.37` (VM ID `1386409`), já roda ~10 outros
  projetos do Douglas via Docker Compose + **Nginx Proxy Manager** (`npm.dodile.com.br`)
  fazendo o reverse proxy + TLS de tudo.
- **Domínio**: `engaja.dodile.com.br` (frontend) e `api.engaja.dodile.com.br` (backend) —
  DNS já aponta pro VPS.
- **Repositório**: https://github.com/Croiser/engaja-.git — só o backend
  (`clube-boa-forma-api`). O frontend NÃO está nesse repo (deploy separado, ver abaixo).
- **Projeto Docker no VPS**: nome `engaja`, arquivo `docker-compose.yml` na raiz do repo
  (esse é o de PRODUÇÃO — ver nota abaixo sobre o nome do arquivo).

## Por que o compose de produção se chama `docker-compose.yml` (não `.prod.yml`)

A API de deploy da Hostinger (`VPS_createNewProjectV1`) só sabe puxar código de duas
formas: uma URL de `docker-compose.yaml` isolada (sem contexto de build — não serve pra
gente, que precisa buildar a imagem da API) ou uma URL de repositório GitHub
(`https://github.com/user/repo`), que ela clona inteiro e resolve automaticamente pro
`docker-compose.yml`/`.yaml` da RAIZ do repo. Não tem como apontar pra um nome de arquivo
diferente nesse segundo modo. Por isso o compose de produção ocupa o nome canônico
`docker-compose.yml`, e o antigo compose de dev (só Postgres, usado localmente pelo
Douglas) foi renomeado pra `docker-compose.dev.yml`.

## Como o deploy funciona (sem SSH)

1. Push pro GitHub (`git push`) — o repo é só a API, sem segredos (`.env`/`.env.prod` no
   `.gitignore`).
2. Chamada `VPS_createNewProjectV1` com `content` = URL do repo GitHub, `project_name` =
   `engaja`, e `environment` = string com os segredos de produção (senha do Postgres,
   JWT_SECRET, QR_SECRET, APP_ROLE_PASSWORD, CORS_ORIGIN, chaves VAPID). Isso substitui o
   `.env.prod` local — os segredos nunca vão pro Git, só pro parâmetro da chamada de API.
3. O `docker-compose.yml` sobe 2 serviços:
   - `db`: Postgres 16, sem porta exposta pro host (só a rede docker interna).
   - `api`: builda a partir do `Dockerfile` do repo. Comando de boot roda
     `npx knex migrate:latest` ANTES do `node src/server.js` — como não existe jeito de
     rodar comando avulso num container já subido (a API da Hostinger não expõe exec/SSH),
     a migration roda automaticamente toda vez que o container inicia (idempotente, sem
     efeito se já estiver tudo migrado). Isso inclui a criação da role `clube_app`
     (`0003_app_role.js`, senha vem de `APP_ROLE_PASSWORD`).
   - A porta da API só é publicada em `127.0.0.1:3390` no host — não é acessível direto da
     internet. Quem expõe pra fora é o Nginx Proxy Manager já rodando no VPS.

## O que falta pra ficar 100% no ar

- **Configurar o proxy host no Nginx Proxy Manager** (`npm.dodile.com.br`) apontando
  `api.engaja.dodile.com.br` → `127.0.0.1:3390`, com SSL (Let's Encrypt, ele já faz
  automático). **Isso não dá pra fazer pela API da Hostinger** — é preciso entrar no
  painel web do NPM (login do Douglas) e cadastrar o proxy host manualmente.
- **Deploy do frontend**: o `clube-boa-forma-app` ainda não foi publicado. Não faz parte
  do repositório Docker (é um site estático, não precisa de container). Formas mais
  simples: `npm run build` gera `dist/`, e ou (a) sobe como mais um proxy host estático no
  próprio VPS (colar os arquivos em alguma pasta servida por nginx/um container simples),
  ou (b) usa hospedagem estática dedicada da Hostinger (fora do VPS). A decidir com o
  Douglas.
- Antes de divulgar pra academias de verdade: Fase 1 do pivot SaaS (cobrança/Asaas —
  bloqueada até ele criar a conta sandbox) e backup automático do Postgres (nenhum
  configurado ainda).

## Segredos de produção gerados (guardados só na chamada de API, não no Git)

Não ficam neste arquivo por segurança. Se precisar re-deployar ou trocar algum segredo,
gerar novos com:
```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"      # senhas
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"      # JWT/QR secret
node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))" # VAPID
```
e chamar `VPS_createNewProjectV1` de novo com o mesmo `project_name` (`engaja`) — ela
substitui o projeto existente.
