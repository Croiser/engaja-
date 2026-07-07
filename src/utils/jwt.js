import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Emissor fixo: rejeita tokens de outra origem mesmo que o segredo vazasse em outro sistema.
const ISS = 'clube-boa-forma';

// Algoritmo FIXADO (HS256). Sem isto, um atacante poderia forjar `alg: none` ou
// tentar confusão de algoritmo (HS256↔RS256) para burlar a verificação de assinatura.
const OPCOES_VERIFY = { algorithms: ['HS256'], issuer: ISS };

// Token de SESSÃO. Curto por padrão; longo se "manter conectado".
export function assinarSessao(payload, manterConectado = false) {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: ISS,
    expiresIn: manterConectado ? env.JWT_EXPIRES_LONGO : env.JWT_EXPIRES,
  });
}

export function verificarSessao(token) {
  return jwt.verify(token, env.JWT_SECRET, OPCOES_VERIFY);
}

// Token do QR da carteirinha. Secret SEPARADO + TTL curto → não pode ser
// fotografado e reusado depois, nem cruzar com o token de sessão.
export function assinarQr(payload) {
  return jwt.sign(payload, env.QR_SECRET, {
    algorithm: 'HS256',
    issuer: ISS,
    expiresIn: env.QR_TTL_SEGUNDOS,
  });
}

export function verificarQr(token) {
  return jwt.verify(token, env.QR_SECRET, OPCOES_VERIFY);
}
