# 🏗️ Arquitetura do Backend — Clube Boa Forma+

**Stack:** Node.js + Express + PostgreSQL + JWT
**Multi-tenant:** isolamento por `academia_id` em toda query
**Data:** reflete decisões da reunião 03/07/2026

---

## 1. Stack e dependências

| Camada | Escolha | Por quê |
|--------|---------|---------|
| Runtime | Node.js 20 LTS | Rápido, ecossistema, mesmo TS do front |
| Framework | Express | Simples, maduro, controle total |
| Banco | PostgreSQL | ACID, relacional, ledger de pontos confiável |
| Auth | JWT + bcrypt | Sessão sem estado; senha com hash |
| Validação | Zod | Schemas de entrada tipados |
| Query | **Knex** (+ `.raw()` no engine) | Migrations versionadas + query builder parametrizado. **Prisma descartado**: duplica a fonte de verdade (schema.prisma × SQL), atrito com `FOR UPDATE`/`RETURNING`/RLS que o engine usa, e client binário nativo complica deploy VPS Linux vindo de dev Windows. `schema.sql`/migrations = fonte única. |
| Jobs | node-cron | Validar check-in 48h, aniversários, streaks, alertas |
| Segurança | helmet, express-rate-limit, cors | Hardening; Cloudflare/firewall na infra |

---

## 2. Estrutura de pastas

```
clube-boa-forma-api/
├── src/
│   ├── config/          # db.js, env.js
│   ├── middlewares/      # auth, tenant, roles, errorHandler, rateLimit
│   ├── modules/
│   │   ├── auth/         # login, troca-senha, me
│   │   ├── alunos/       # carteirinha, saldo, perfil
│   │   ├── pontos/       # ledger, extrato
│   │   ├── selos/        # níveis + conquistas
│   │   ├── desafios/     # editáveis + progresso
│   │   ├── checkins/     # geoloc / QR
│   │   ├── parceiros/    # catálogo + validação lojista
│   │   ├── premios/      # vitrine + resgate + voucher
│   │   ├── admin/        # CRUDs, dashboard, relatórios
│   │   └── auditoria/    # logs
│   ├── engine/           # motor de gamificação (pontos, selos, níveis)
│   ├── jobs/             # cron
│   ├── utils/            # voucher, saldo, datas
│   ├── app.js            # express + middlewares
│   └── server.js         # bootstrap
├── db/
│   ├── schema.sql        # ✅ criado
│   ├── migrations/
│   └── seed_gamificacao.sql  # (reuso do repo front)
├── .env.example
└── package.json
```

---

## 3. API — endpoints por módulo

### 🔐 Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login` | `{ identificador (matrícula/CPF), senha, manter_conectado }` → JWT + `precisa_trocar_senha` + `precisa_aceitar_termos` |
| POST | `/auth/trocar-senha` | `{ senha_atual, nova_senha }` (obrigatório no 1º login) |
| POST | `/auth/aceitar-termos` | LGPD: grava `termos_aceitos_em` (obrigatório no 1º login) |
| GET  | `/auth/me` | dados do usuário logado |
| POST | `/auth/logout` | invalida sessão (client apaga JWT) |
| POST | `/auth/whatsapp` | **(fase 2)** link mágico |

> **Gate do middleware de auth:** enquanto `senha_trocada=false` OU `termos_aceitos_em IS NULL`,
> o token só acessa `/auth/trocar-senha`, `/auth/aceitar-termos` e `/auth/me`. Qualquer outra
> rota responde **403 `SETUP_PENDENTE`** — força o setup inicial sem atrito.

### 👤 Aluno (self)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/me/carteirinha` | dados estáticos: nome, matrícula, validade, saldo, nível |
| GET | `/me/carteirinha/qr` | QR renovável: JWT curto (TTL ~60-90s, secret separado) — front dá refresh sem re-buscar dados |
| POST | `/me/indicacoes` | registra convite `{ nome_indicado, telefone }` → gera código (crédito só quando amigo fecha matrícula) |
| GET | `/me/saldo` | saldo atual (SUM ledger validado) |
| GET | `/me/pontos` | extrato (histórico do ledger) |
| GET | `/me/selos` | conquistados + bloqueados com progresso + nível atual |
| GET | `/me/desafios` | desafios ativos + progresso do aluno |
| POST | `/me/checkin` | `{ metodo: geoloc\|qr, lat,lng \| qr_code }` |
| GET | `/parceiros?categoria=` | catálogo (filtros) |
| GET | `/parceiros/:id` | detalhes (endereço, regras) |
| POST | `/me/beneficio/:parceiroId/usar` | gera código/QR do desconto |
| GET | `/premios` | vitrine |
| POST | `/premios/:id/resgatar` | debita saldo → gera voucher |

### 🏪 Parceiro (lojista) — login próprio (`usuarios.tipo='parceiro'`)
Fluxo de 3 passos (decisão 03/07: lojista tem login e tela própria):
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/me/beneficio/:parceiroId/usar` | **(aluno)** gera código curto + QR, status `gerado`, TTL 5-10 min |
| POST | `/parceiro/validar` | **(lojista)** `{ codigo }` → confere status `gerado` + não expirado + mesma academia → devolve nome do aluno + regras (NÃO consome ainda) |
| POST | `/parceiro/confirmar` | **(lojista)** confirma uso real → status `confirmado`, grava `confirmado_por` → só aqui conta no relatório |

> O lojista entra pelo mesmo `/auth/login` (identificado por `tipo='parceiro'`); seu token só
> enxerga o próprio parceiro/academia. Código de benefício expira (`expira_em`) → evita reuso.

### 🛠️ Admin (recepção / gerente)
| Método | Rota | Perfil |
|--------|------|--------|
| GET/POST/PUT | `/admin/alunos` | recepção + gerente (POST aceita `indicado_por` opcional → credita +500 ao indicador) |
| POST | `/admin/alunos/:id/cancelar` | inativa aluno + evento `cancelamento_zera_saldo` no ledger (NUNCA DELETE retroativo) + auditoria |
| POST | `/admin/alunos/:id/pontos` | ajuste manual `{ quantidade: +/-N, motivo }` → mesmo `engine.creditar/debitar` com `auditado_por` + **auditoria** |
| CRUD | `/admin/parceiros`, `/admin/categorias-parceiros` | gerente |
| CRUD | `/admin/premios` | gerente |
| CRUD | `/admin/desafios` | gerente |
| CRUD | `/admin/selos` | gerente |
| GET | `/admin/dashboard` | cards: alunos, clube ativo %, vencendo 30d, parceiros, **alunos por nível** |
| GET | `/admin/relatorios/*` | gerente |
| GET | `/admin/auditoria` | gerente |

**Permissões:** `recepcao` = CRUD alunos + check-in manual + visão geral. `gerente` = tudo.

---

## 4. Motor de Gamificação (`src/engine/`)

### Fluxo de pontos (sempre via ledger, sempre em transação)
1. Evento acontece (check-in, indicação fechada, desafio, aniversário…)
2. `engine.creditar(trx, {...})` → INSERT em `pontos_ledger` + atualiza caches (`saldo_atual`, `pontos_acumulados_vida`) na **mesma** trx
3. Após creditar: `engine.avaliarSelos(trx, aluno)` → concede selos cujo critério foi atingido
4. Resgate: `engine.debitar(trx, {...})` → INSERT negativo (guard de saldo atômico, ver abaixo)

### ⚠️ Concorrência (decisões travadas)
- **Saldo é cache desnormalizado** (`usuarios.saldo_atual`), atualizado na mesma transação do ledger.
  A fonte de verdade histórica continua sendo o `pontos_ledger` (append-only). Recalcular por
  `SUM` só em auditoria/reconciliação.
- **Débito atômico (resgate/ajuste):** `UPDATE usuarios SET saldo_atual = saldo_atual - $q
  WHERE id=$id AND saldo_atual >= $q RETURNING saldo_atual`. Se vier vazio → `SaldoInsuficienteError`
  e rollback. Serializa débitos concorrentes do mesmo aluno sem lock de tabela.
- **Estoque de prêmio:** `UPDATE premios SET estoque = estoque - 1 WHERE id=$1 AND estoque > 0
  RETURNING estoque`. Vazio → sem estoque. Elimina corrida no "último item".
- **Idempotência dos jobs:** checar estado (`validado=false`, `concluido=false`) DENTRO da mesma
  trx do UPDATE — se o cron rodar 2x, não credita em dobro.
- **Cancelamento zera saldo:** evento `cancelamento_zera_saldo` (qtd = -saldo_atual) no ledger +
  `saldo_atual=0`; nunca DELETE/UPDATE retroativo no histórico.

### Regras (da reunião)
- **Check-in:** 1/dia, **+10 pts**, validado após **48h** (job). Método geoloc **ou** QR.
- **Consecutivos:** 7 dias = **+100**, 30 dias = **+500** (job de streak).
- **Indicação:** +500 quando o amigo fecha plano; **5 indicações = selo "Embaixador"**.
- **Aniversário:** +300 (job diário).
- **Avaliação física / atividades:** pontos definidos no desafio (100–500).
- **Desafios editáveis:** admin cria (nome, pontos, meta, tipo, selo).
- **Saldo NÃO expira** (sem job de expiração).
- **Cancelamento/inativação:** zera saldo do aluno.

### Selos e Níveis (configuráveis)
- **Níveis** (`eh_nivel=true`, critério `pontos_acumulados_vida`): Bronze/Prata/Ouro/Platina.
  Baseado no **acumulado na vida** (só cresce) → resgatar **nunca rebaixa**.
- **Conquistas:** 100 treinos, Maratonista, streak, Embaixador, 1 ano…
- **Sorteios (futuro):** filtrar `alunos_selos` por selo → lista de participantes.

---

## 5. Jobs (cron)

| Job | Frequência | Ação |
|-----|-----------|------|
| Validar check-ins | a cada hora | check-ins com +48h → `validado=true` + credita e reavalia selos |
| Aniversários | diário 00:05 | quem faz aniversário → +300 |
| Streaks | diário | calcula dias consecutivos → concede 7d/30d |
| Alertas de vencimento | diário | clubes vencendo < 30 dias → flag no dashboard |
| ~~Expiração de pontos~~ | — | **não existe** (pontos não expiram) |

---

## 6. Segurança

- **JWT** (30 dias se "manter conectado"; curto caso contrário) + **bcrypt** nas senhas.
- **1º login força troca** da senha padrão "123".
- **Isolamento multi-tenant:** middleware injeta `academia_id` e todo query filtra por ele.
- **Rate-limit** no login e endpoints sensíveis. **helmet** + **CORS** restrito.
- **Auditoria** de toda ação manual (ajuste de pontos, exclusão de aluno, etc.).
- Infra: **Cloudflare** (anti-DDoS) + firewall + 2 usuários na VPS. SSL Let's Encrypt.

---

## 7. Ordem de implementação (casa com as 8 fases)

1. **Setup + Auth** (login, troca senha, JWT, tenant middleware)
2. **Aluno core** (carteirinha, saldo, ledger, check-in)
3. **Gamificação** (engine: creditar/debitar, selos, níveis, jobs)
4. **Parceiros** (catálogo, categorias, validação lojista)
5. **Prêmios** (vitrine, resgate, voucher)
6. **Admin** (CRUDs, dashboard, desafios/selos editáveis, auditoria)
7. **Testes + segurança**
8. **Deploy VPS + go-live**

> Próximo passo sugerido: gerar o **scaffold do projeto** (package.json, app.js, db.js,
> middlewares de auth/tenant) e o **módulo de Auth** completo. É por onde tudo começa.
