import { verificarSessao } from '../utils/jwt.js';
import { comSistema } from '../config/db.js';
import { Erros } from '../utils/errors.js';
import { asyncHandler } from './errorHandler.js';

// Autentica o Bearer token e carrega o usuário. Preenche req.usuario e req.tenantId.
// req.tenantId é a ÂNCORA do multi-tenant: todo módulo filtra por ele.
export const autenticar = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) throw Erros.naoAutenticado();

  let payload;
  try {
    payload = verificarSessao(token);
  } catch {
    throw Erros.naoAutenticado();
  }

  // Lookup por PK a partir de um JWT já verificado → contexto de sistema (bypass RLS).
  // Join com academias: se a academia foi suspensa DEPOIS do login (SaaS — inadimplência),
  // a sessão já aberta também é barrada na próxima requisição, não só em logins novos.
  const usuario = await comSistema((trx) =>
    trx('usuarios as u')
      .join('academias as a', 'a.id', 'u.academia_id')
      .where({ 'u.id': payload.sub, 'u.ativo': true })
      .andWhere((qb) => qb.where('u.tipo', 'superadmin').orWhere('a.ativo', true))
      .first('u.id', 'u.academia_id', 'u.tipo', 'u.nome', 'u.senha_trocada', 'u.termos_aceitos_em'),
  );
  if (!usuario) throw Erros.naoAutenticado();

  req.usuario = usuario;
  req.tenantId = usuario.academia_id;
  next();
});

// Gate de setup inicial: bloqueia tudo até trocar a senha padrão e aceitar os termos.
// Rotas liberadas durante o setup são passadas em `exceto`.
export function exigirSetupCompleto(exceto = []) {
  return (req, _res, next) => {
    if (exceto.includes(req.path)) return next();
    const pendente = !req.usuario.senha_trocada || !req.usuario.termos_aceitos_em;
    if (pendente) throw Erros.setupPendente();
    next();
  };
}
