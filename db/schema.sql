-- =====================================================================
-- Clube Boa Forma+ — Schema PostgreSQL (backend)
-- Multi-tenant por academia_id. Reflete decisões da reunião 03/07/2026
-- + revisão de arquitetura (concorrência, LGPD, indicação, fluxo lojista).
-- Princípios: saldo tipo carteira (ledger imutável, não expira), selos/níveis
-- configuráveis, desafios editáveis, categorias editáveis.
--
-- Fonte de verdade do saldo = pontos_ledger (append-only, NUNCA UPDATE/DELETE).
-- usuarios.saldo_atual e usuarios.pontos_acumulados_vida são CACHES
-- desnormalizados, sempre atualizados na MESMA transação do INSERT no ledger.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- Fuso de referência do negócio (Foz do Iguaçu). Usado no dia do check-in.
-- (No app, garanta timezone da conexão; aqui a coluna gerada fixa o fuso.)

-- ---------- TENANT ----------
CREATE TABLE academias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          VARCHAR(150) NOT NULL,
  slug          VARCHAR(80) UNIQUE NOT NULL,        -- boaformafoz
  dominio       VARCHAR(150),
  logo_url      TEXT,
  cor_primaria  VARCHAR(9) DEFAULT '#0A0A0A',
  cor_secundaria VARCHAR(9) DEFAULT '#F5B301',
  qr_secret     TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),  -- assina/valida o QR fixo da recepção
  ativo         BOOLEAN DEFAULT TRUE,
  criado_em     TIMESTAMPTZ DEFAULT now()
);

-- ---------- USUÁRIOS (aluno, recepção, gerente, parceiro/lojista, superadmin) ----------
CREATE TABLE usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id    UUID NOT NULL REFERENCES academias(id),
  tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('aluno','recepcao','gerente','parceiro','superadmin')),
  nome           VARCHAR(150) NOT NULL,
  cpf            VARCHAR(14),
  matricula      VARCHAR(20),                       -- formato BF123456
  telefone       VARCHAR(20),
  email          VARCHAR(150),
  senha_hash     TEXT NOT NULL,                     -- bcrypt (inicial "123")
  senha_trocada  BOOLEAN DEFAULT FALSE,             -- força troca no 1º login
  termos_aceitos_em TIMESTAMPTZ,                    -- LGPD: aceite obrigatório no 1º login
  plano          VARCHAR(60),
  data_vencimento DATE,                             -- vencimento do clube
  data_matricula DATE DEFAULT CURRENT_DATE,
  data_nascimento DATE,                             -- aniversário (+300 pts)
  indicado_por   UUID REFERENCES usuarios(id),      -- aluno que indicou (dispara +500 ao fechar matrícula)

  -- Caches desnormalizados (fonte de verdade continua sendo o ledger)
  saldo_atual            INT NOT NULL DEFAULT 0 CHECK (saldo_atual >= 0),  -- guard de débito atômico
  pontos_acumulados_vida INT NOT NULL DEFAULT 0,                           -- só cresce; base dos NÍVEIS
  streak_atual           INT NOT NULL DEFAULT 0,   -- dias consecutivos de check-in
  streak_maior           INT NOT NULL DEFAULT 0,
  ultimo_checkin_dia     DATE,                      -- para calcular streak sem varrer checkins

  ativo          BOOLEAN DEFAULT TRUE,
  criado_em      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (academia_id, matricula),
  UNIQUE (academia_id, cpf)
);
CREATE INDEX idx_usuarios_academia ON usuarios(academia_id);
CREATE INDEX idx_usuarios_venc ON usuarios(academia_id, data_vencimento) WHERE tipo='aluno';

-- ---------- PONTOS: LEDGER (carteira append-only; NUNCA UPDATE/DELETE) ----------
CREATE TABLE pontos_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id      UUID NOT NULL REFERENCES usuarios(id),
  academia_id   UUID NOT NULL REFERENCES academias(id),
  tipo_evento   VARCHAR(40) NOT NULL,               -- check_in, indicacao, desafio, aniversario, streak, resgate, ajuste_manual, cancelamento_zera_saldo...
  quantidade    INT NOT NULL,                       -- + ganho / - resgate
  descricao     TEXT,
  validado      BOOLEAN DEFAULT FALSE,              -- check-in vira TRUE após 48h (só então entra no saldo)
  ref_id        UUID,                               -- id do desafio/resgate/parceiro/checkin relacionado
  auditado_por  UUID REFERENCES usuarios(id),       -- NULL se automático
  criado_em     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ledger_aluno ON pontos_ledger(aluno_id) WHERE validado;
CREATE INDEX idx_ledger_aluno_data ON pontos_ledger(aluno_id, criado_em DESC);        -- extrato paginado
CREATE INDEX idx_ledger_pendente ON pontos_ledger(academia_id) WHERE NOT validado;    -- job de validação 48h
-- Saldo canônico (auditoria/recalculo): SELECT COALESCE(SUM(quantidade),0) FROM pontos_ledger WHERE aluno_id=$1 AND validado;
-- Acumulado vida:                        SELECT COALESCE(SUM(quantidade),0) FROM pontos_ledger WHERE aluno_id=$1 AND validado AND quantidade>0;
-- No dia-a-dia leia usuarios.saldo_atual / pontos_acumulados_vida (caches).

-- ---------- SELOS / NÍVEIS (catálogo configurável) ----------
CREATE TABLE selos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id   UUID NOT NULL REFERENCES academias(id),
  nome          VARCHAR(100) NOT NULL,
  icone         VARCHAR(50),
  imagem_url    TEXT,
  tipo_criterio VARCHAR(40) NOT NULL,               -- pontos_acumulados_vida, treinos_total, streak, indicacoes, dias_matricula
  meta          INT NOT NULL,
  eh_nivel      BOOLEAN DEFAULT FALSE,              -- TRUE p/ Bronze/Prata/Ouro/Platina (nível = maior meta atingida)
  ativo         BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_selos_academia_ativo ON selos(academia_id) WHERE ativo;

CREATE TABLE alunos_selos (
  aluno_id       UUID NOT NULL REFERENCES usuarios(id),
  selo_id        UUID NOT NULL REFERENCES selos(id),
  conquistado_em TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (aluno_id, selo_id)
);

-- ---------- DESAFIOS / ATIVIDADES (editáveis pelo admin) ----------
CREATE TABLE desafios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id  UUID NOT NULL REFERENCES academias(id),
  nome         VARCHAR(120) NOT NULL,
  descricao    TEXT,
  tipo         VARCHAR(30) NOT NULL,                -- check_in_consecutivo, indicacao, atividade, livre
  pontos       INT NOT NULL,
  meta         INT,                                 -- ex.: 7 (dias), 5 (indicações)
  selo_id      UUID REFERENCES selos(id),           -- concede selo ao concluir (ex.: Embaixador)
  data_inicio  DATE,
  data_fim     DATE,
  ativo        BOOLEAN DEFAULT TRUE,
  criado_por   UUID REFERENCES usuarios(id),
  criado_em    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE desafios_progresso (
  aluno_id     UUID NOT NULL REFERENCES usuarios(id),
  desafio_id   UUID NOT NULL REFERENCES desafios(id),
  progresso    INT DEFAULT 0,
  concluido    BOOLEAN DEFAULT FALSE,
  concluido_em TIMESTAMPTZ,
  PRIMARY KEY (aluno_id, desafio_id)
);
CREATE INDEX idx_desafios_progresso_desafio ON desafios_progresso(desafio_id);  -- relatório: quantos completaram

-- ---------- INDICAÇÃO DE AMIGO ----------
-- Aluno registra um convite (nome/telefone). Só credita +500 quando o indicado
-- fecha matrícula (admin cria o aluno com indicado_por preenchido → confirma aqui).
CREATE TABLE indicacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id    UUID NOT NULL REFERENCES academias(id),
  indicador_id   UUID NOT NULL REFERENCES usuarios(id),   -- aluno que indicou
  nome_indicado  VARCHAR(150) NOT NULL,
  telefone_indicado VARCHAR(20),
  codigo         VARCHAR(20),                              -- código de indicação (opcional)
  status         VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente','fechada','cancelada')),
  aluno_indicado_id UUID REFERENCES usuarios(id),          -- preenchido quando vira matrícula
  fechada_em     TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_indicacoes_indicador ON indicacoes(indicador_id, status);

-- ---------- PARCEIROS ----------
CREATE TABLE categorias_parceiros (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id  UUID NOT NULL REFERENCES academias(id),
  nome         VARCHAR(80) NOT NULL,
  icone        VARCHAR(50),
  ordem        INT DEFAULT 0,
  ativo        BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_categorias_academia ON categorias_parceiros(academia_id) WHERE ativo;

CREATE TABLE parceiros (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id    UUID NOT NULL REFERENCES academias(id),
  categoria_id   UUID REFERENCES categorias_parceiros(id),
  nome           VARCHAR(150) NOT NULL,
  logo_url       TEXT,
  tipo_beneficio VARCHAR(20) CHECK (tipo_beneficio IN ('DESCONTO','VALE')),
  valor_desconto VARCHAR(40),                       -- "15%" ou "R$ 20"
  descricao      TEXT,
  endereco       TEXT,
  regras         TEXT,
  limite_uso     VARCHAR(20) DEFAULT 'ilimitado',   -- ilimitado, 1_dia, 1_semana, custom
  usuario_login  UUID REFERENCES usuarios(id),      -- login do lojista (usuarios.tipo='parceiro')
  ativo          BOOLEAN DEFAULT TRUE,
  criado_em      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_parceiros_academia_cat ON parceiros(academia_id, categoria_id) WHERE ativo;

-- Fluxo de 3 passos: aluno GERA código (status=gerado, com TTL) → lojista VALIDA
-- (confere) → lojista CONFIRMA (status=confirmado). Só 'confirmado' conta no relatório.
CREATE TABLE usos_beneficio (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id       UUID NOT NULL REFERENCES usuarios(id),
  parceiro_id    UUID NOT NULL REFERENCES parceiros(id),
  academia_id    UUID NOT NULL REFERENCES academias(id),
  codigo         VARCHAR(30) NOT NULL,               -- código curto mostrado pelo aluno
  status         VARCHAR(20) DEFAULT 'gerado' CHECK (status IN ('gerado','confirmado','expirado','cancelado')),
  expira_em      TIMESTAMPTZ NOT NULL,               -- TTL curto (ex.: 5-10 min)
  confirmado_por UUID REFERENCES usuarios(id),       -- lojista que confirmou
  confirmado_em  TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_usos_anti_abuso ON usos_beneficio(aluno_id, parceiro_id, criado_em DESC);
CREATE INDEX idx_usos_parceiro ON usos_beneficio(parceiro_id, criado_em DESC);
CREATE UNIQUE INDEX idx_usos_codigo_ativo ON usos_beneficio(academia_id, codigo) WHERE status = 'gerado';

-- ---------- PRÊMIOS / RESGATES ----------
CREATE TABLE premios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id  UUID NOT NULL REFERENCES academias(id),
  nome         VARCHAR(150) NOT NULL,
  imagem_url   TEXT,
  custo_pontos INT NOT NULL CHECK (custo_pontos > 0),
  estoque      INT NOT NULL DEFAULT 0 CHECK (estoque >= 0),  -- guard atômico no resgate
  ativo        BOOLEAN DEFAULT TRUE
);

CREATE TABLE resgates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id       UUID NOT NULL REFERENCES usuarios(id),
  premio_id      UUID NOT NULL REFERENCES premios(id),
  academia_id    UUID NOT NULL REFERENCES academias(id),
  custo_pontos   INT NOT NULL,
  voucher_codigo VARCHAR(30) UNIQUE,                 -- apresentar na recepção
  status         VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente','retirado','cancelado','expirado')),
  criado_em      TIMESTAMPTZ DEFAULT now(),
  retirado_em    TIMESTAMPTZ
);
CREATE INDEX idx_resgates_aluno ON resgates(aluno_id, criado_em DESC);

-- ---------- CHECK-IN ----------
CREATE TABLE checkins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id     UUID NOT NULL REFERENCES usuarios(id),
  academia_id  UUID NOT NULL REFERENCES academias(id),
  metodo       VARCHAR(10) CHECK (metodo IN ('geoloc','qr')),
  lat          NUMERIC(9,6),
  lng          NUMERIC(9,6),
  foto_url     TEXT,                                 -- comprovante quando check-in por foto
  validado     BOOLEAN DEFAULT FALSE,                -- valida em 48h → credita +10
  criado_em    TIMESTAMPTZ DEFAULT now(),
  -- dia do check-in no fuso do negócio (evita duplicidade perto da meia-noite)
  dia_checkin  DATE GENERATED ALWAYS AS ((criado_em AT TIME ZONE 'America/Sao_Paulo')::date) STORED,
  UNIQUE (aluno_id, dia_checkin)                      -- 1 check-in/dia
);
CREATE INDEX idx_checkins_pendentes ON checkins(academia_id) WHERE NOT validado;

-- ---------- AUDITORIA (tudo que é manual) ----------
CREATE TABLE auditoria_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academia_id  UUID NOT NULL REFERENCES academias(id),
  usuario_id   UUID REFERENCES usuarios(id),         -- quem fez
  acao         VARCHAR(60) NOT NULL,                 -- ajuste_pontos, cria_aluno, exclui_aluno, cancela_aluno...
  entidade     VARCHAR(40),
  entidade_id  UUID,
  detalhes     JSONB,
  ip_origem    VARCHAR(45),                          -- rastreabilidade de ações sensíveis
  user_agent   TEXT,
  criado_em    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_auditoria_academia ON auditoria_logs(academia_id, criado_em DESC);
