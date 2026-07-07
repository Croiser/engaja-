import { Router } from 'express';
import { autenticar, exigirSetupCompleto } from '../../middlewares/auth.js';
import { soAluno } from '../../middlewares/roles.js';
import { comTenantHandler } from '../../middlewares/tenant.js';
import { validarBody, validarQuery } from '../../middlewares/validate.js';
import { acaoRateLimit } from '../../middlewares/rateLimit.js';
import { checkinSchema, extratoQuerySchema } from './aluno.schema.js';
import { criarIndicacaoSchema } from '../leads/leads.schema.js';
import * as service from './aluno.service.js';
import * as checkinService from './checkin.service.js';
import * as leadsService from '../leads/leads.service.js';
import * as parceirosService from '../parceiros/parceiros.service.js';
import * as premiosService from '../premios/premios.service.js';

// Rotas self-service do aluno, montadas em /me. Todas exigem sessão + setup completo +
// role aluno, e rodam sob contexto de TENANT (RLS) via comTenantHandler → req.db.
export const alunoRouter = Router();
alunoRouter.use(autenticar, exigirSetupCompleto(), soAluno);

// GET /me/carteirinha
alunoRouter.get(
  '/carteirinha',
  comTenantHandler(async (req, res) => res.json(await service.carteirinha(req.db, req.usuario.id))),
);

// GET /me/carteirinha/qr — não toca no banco (só assina JWT); asyncHandler bastaria,
// mas mantemos o wrapper por consistência (o req.db abre e fecha sem uso).
alunoRouter.get(
  '/carteirinha/qr',
  comTenantHandler(async (req, res) => res.json(service.gerarQrCarteirinha(req.usuario))),
);

// GET /me/saldo
alunoRouter.get(
  '/saldo',
  comTenantHandler(async (req, res) => res.json(await service.saldo(req.db, req.usuario.id))),
);

// GET /me/pontos?page=&limit= — extrato paginado
alunoRouter.get(
  '/pontos',
  validarQuery(extratoQuerySchema),
  comTenantHandler(async (req, res) => res.json(await service.extrato(req.db, req.usuario.id, req.q))),
);

// GET /me/selos — conquistados + bloqueados com progresso
alunoRouter.get(
  '/selos',
  comTenantHandler(async (req, res) => res.json(await service.selosDoAluno(req.db, req.usuario.id))),
);

// POST /me/indicacoes — aluno indica um amigo (vira lead 'novo' + avisa recepção)
alunoRouter.post(
  '/indicacoes',
  acaoRateLimit,
  validarBody(criarIndicacaoSchema),
  comTenantHandler(async (req, res) =>
    res.status(201).json(await leadsService.criarIndicacao(req.db, req.usuario, req.body)),
  ),
);

// GET /me/indicacoes — status das minhas indicações
alunoRouter.get(
  '/indicacoes',
  comTenantHandler(async (req, res) => res.json(await leadsService.minhasIndicacoes(req.db, req.usuario.id))),
);

// GET /me/desafios — desafios ativos + progresso do aluno
alunoRouter.get(
  '/desafios',
  comTenantHandler(async (req, res) => res.json(await service.desafios(req.db, req.usuario.id))),
);

// POST /me/beneficio/:parceiroId/usar — gera código do benefício (TTL curto) p/ mostrar ao lojista
alunoRouter.post(
  '/beneficio/:parceiroId/usar',
  acaoRateLimit,
  comTenantHandler(async (req, res) =>
    res.status(201).json(await parceirosService.gerarBeneficio(req.db, req.usuario, req.params.parceiroId)),
  ),
);

// POST /me/premios/:id/resgatar — debita saldo + baixa estoque (atômico) → voucher
alunoRouter.post(
  '/premios/:id/resgatar',
  acaoRateLimit,
  comTenantHandler(async (req, res) =>
    res.status(201).json(await premiosService.resgatar(req.db, req.usuario, req.params.id)),
  ),
);

// GET /me/resgates — meus vouchers + status
alunoRouter.get(
  '/resgates',
  comTenantHandler(async (req, res) => res.json(await premiosService.meusResgates(req.db, req.usuario.id))),
);

// POST /me/checkin — geoloc | qr (1x/dia; crédito em 48h)
alunoRouter.post(
  '/checkin',
  acaoRateLimit,
  validarBody(checkinSchema),
  comTenantHandler(async (req, res) => {
    const checkin = await checkinService.fazerCheckin(req.db, req.usuario, req.body);
    res.status(201).json({
      ok: true,
      checkin_id: checkin.id,
      mensagem: 'Check-in registrado! Os 10 pontos entram em até 48h.',
    });
  }),
);
