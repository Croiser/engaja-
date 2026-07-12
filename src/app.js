import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { globalRateLimit } from './middlewares/rateLimit.js';
import { authRouter } from './modules/auth/auth.controller.js';
import { alunoRouter } from './modules/aluno/aluno.controller.js';
import { adminDesafiosRouter } from './modules/admin/desafios.controller.js';
import { leadsRouter } from './modules/leads/leads.controller.js';
import { notificacoesRouter } from './modules/notificacoes/notificacoes.controller.js';
import { pushRouter } from './modules/push/push.controller.js';
import { adminParceirosRouter, catalogoRouter } from './modules/parceiros/parceiros.controller.js';
import { lojistaRouter } from './modules/parceiros/lojista.controller.js';
import { vitrineRouter, adminPremiosRouter } from './modules/premios/premios.controller.js';
import { adminAlunosRouter } from './modules/admin/alunos.controller.js';
import { adminSelosRouter } from './modules/selos/selos.controller.js';
import { adminMarcaRouter } from './modules/admin/marca.controller.js';
import { dashboardRouter } from './modules/admin/dashboard.controller.js';
import { superadminRouter } from './modules/superadmin/superadmin.controller.js';

export const app = express();

// Atrás do Cloudflare/nginx: confia no X-Forwarded-For p/ obter o IP real (rate-limit).
app.set('trust proxy', env.TRUST_PROXY);
app.disable('x-powered-by'); // não anuncia "Express" para quem sonda

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' })); // corpo grande = 413, barra payload-bomb
app.use(globalRateLimit); // teto global por IP (antes das rotas)

// Healthcheck (usado pelo monitor da VPS / Cloudflare). Sem rate-limit pesado.
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Chave pública VAPID — o front precisa dela para assinar o Web Push (pode ser pública).
app.get('/config/vapid-public', (_req, res) => res.json({ chave: env.VAPID_PUBLIC ?? null }));

// Uploads (logo da academia) — arquivo público por natureza (a logo aparece pro aluno
// sem login). UPLOAD_DIR precisa ser um volume persistente em produção (ver docker-compose.yml).
app.use('/uploads', express.static(env.UPLOAD_DIR));

// ---- Rotas ----
app.use('/auth', authRouter);
// Rotas compartilhadas (qualquer papel) ANTES do /me do aluno — prefixos mais
// específicos primeiro, senão o soAluno do alunoRouter barraria gerente/recepção.
app.use('/me/notificacoes', notificacoesRouter); // mural interno
app.use('/me/push', pushRouter); // registro de tokens Web Push

app.use('/parceiros', catalogoRouter); // catálogo (aluno navega) — antes do /me genérico
app.use('/premios', vitrineRouter); // vitrine de resgate (aluno) — antes do /me genérico
app.use('/me', alunoRouter); // carteirinha, saldo, pontos, selos, check-in, desafios, indicações, benefício, resgate
app.use('/parceiro', lojistaRouter); // área do lojista: validar + confirmar benefício
app.use('/admin/desafios', adminDesafiosRouter); // CRUD de desafios (gerente)
app.use('/admin/leads', leadsRouter); // CRM de leads / indicações (recepção + gerente)
app.use('/admin/parceiros', adminParceirosRouter); // CRUD parceiros + categorias (gerente)
app.use('/admin/premios', adminPremiosRouter); // CRUD prêmios (gerente) + baixa de voucher (recepção)
app.use('/admin/selos', adminSelosRouter); // CRUD selos/níveis (gerente)
app.use('/admin/academia', adminMarcaRouter); // autoatendimento: gerente edita a própria marca
app.use('/admin/alunos', adminAlunosRouter); // CRUD alunos + cancelar (zera saldo) + ajuste de pontos
app.use('/admin', dashboardRouter); // dashboard, relatórios, auditoria (gerente)
app.use('/superadmin', superadminRouter); // dono da plataforma: CRUD academias, cross-tenant

// 404 padrão.
app.use((_req, res) => res.status(404).json({ erro: { codigo: 'ROTA_NAO_ENCONTRADA' } }));

// Handler de erros (sempre por último).
app.use(errorHandler);
