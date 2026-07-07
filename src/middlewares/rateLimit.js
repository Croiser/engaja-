import rateLimit from 'express-rate-limit';

// Protege o login de brute-force. Cloudflare/firewall cobrem DDoS na borda;
// isto é a defesa de aplicação por IP.
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10, // 10 tentativas por IP na janela
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: { codigo: 'MUITAS_TENTATIVAS', mensagem: 'Muitas tentativas. Tente mais tarde.' } },
});

// Limite geral (endpoints sensíveis: check-in, geração de código de benefício, resgate).
export const acaoRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Teto GLOBAL por IP em toda a API — barra varredura/abuso automatizado de quem
// tem o link. Generoso o bastante para uso normal do PWA; Cloudflare cobre o DDoS bruto.
export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: { codigo: 'MUITAS_REQUISICOES', mensagem: 'Muitas requisições. Aguarde um instante.' } },
});
