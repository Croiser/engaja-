// Carrega e valida as variáveis de ambiente uma única vez no boot.
// Falhar cedo (aqui) é melhor do que descobrir um segredo faltando em produção.
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),

  // Conexão do APP: role NOSUPERUSER `clube_app` (sujeito ao RLS). NUNCA use aqui a
  // conexão de superusuário — superusuário ignora RLS e o isolamento por tenant cai.
  APP_DATABASE_URL: z.string().min(1, 'APP_DATABASE_URL é obrigatório'),
  DB_TIMEZONE: z.string().default('America/Sao_Paulo'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET muito curto'),
  JWT_EXPIRES: z.string().default('1d'),
  JWT_EXPIRES_LONGO: z.string().default('30d'),

  QR_SECRET: z.string().min(16, 'QR_SECRET muito curto'),
  QR_TTL_SEGUNDOS: z.coerce.number().default(90),

  BENEFICIO_TTL_SEGUNDOS: z.coerce.number().default(600),

  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Nº de proxies confiáveis à frente da API (Cloudflare + eventual nginx).
  // Necessário para o rate-limit enxergar o IP REAL do cliente, não o do proxy.
  // 0 = sem proxy (dev direto). Em produção atrás do Cloudflare: 1 (ou 2 com nginx).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),

  // Web Push (VAPID). Gerar com: node -e "console.log(require('web-push').generateVAPIDKeys())".
  // Sem estas chaves, o push é desligado (mural interno continua funcionando).
  VAPID_PUBLIC: z.string().optional(),
  VAPID_PRIVATE: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:contato@boaformafoz.com.br'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
