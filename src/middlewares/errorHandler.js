import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

// Handler central. Converte AppError em resposta previsível; qualquer outro erro
// vira 500 genérico (sem vazar stack em produção).
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      erro: { codigo: err.codigo, mensagem: err.message, detalhes: err.detalhes ?? undefined },
    });
  }

  // Violação de UNIQUE (Postgres 23505) — ex.: matrícula/CPF duplicado, check-in do dia.
  if (err.code === '23505') {
    return res
      .status(409)
      .json({ erro: { codigo: 'CONFLITO', mensagem: 'Registro duplicado.' } });
  }

  console.error('[erro-nao-tratado]', err);
  const mensagem = env.NODE_ENV === 'production' ? 'Erro interno.' : err.message;
  return res.status(500).json({ erro: { codigo: 'ERRO_INTERNO', mensagem } });
}

// Envolve handlers async para propagar rejeições ao errorHandler sem try/catch em cada rota.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
