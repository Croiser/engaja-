import { AppError } from '../utils/errors.js';

// Valida req.body contra um schema Zod e substitui pelo dado parseado (tipado/limpo).
export function validarBody(schema) {
  return (req, _res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      const detalhes = r.error.issues.map((i) => ({ campo: i.path.join('.'), erro: i.message }));
      throw new AppError('DADOS_INVALIDOS', 'Dados inválidos.', 400, detalhes);
    }
    req.body = r.data;
    next();
  };
}

// Valida req.query e expõe o resultado tipado em req.q (não sobrescreve req.query,
// que no Express 5 é getter). Use req.q nos handlers.
export function validarQuery(schema) {
  return (req, _res, next) => {
    const r = schema.safeParse(req.query);
    if (!r.success) {
      const detalhes = r.error.issues.map((i) => ({ campo: i.path.join('.'), erro: i.message }));
      throw new AppError('DADOS_INVALIDOS', 'Parâmetros inválidos.', 400, detalhes);
    }
    req.q = r.data;
    next();
  };
}
