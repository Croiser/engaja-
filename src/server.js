import { app } from './app.js';
import { env } from './config/env.js';
import { db } from './config/db.js';
import { registrarJobs } from './jobs/index.js';

const server = app.listen(env.PORT, () => {
  console.log(`🟢 Clube Boa Forma+ API rodando em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

// Jobs cron só fora de teste (evita efeitos colaterais em CI).
if (env.NODE_ENV !== 'test') registrarJobs();

// Encerramento gracioso: fecha o pool do banco antes de sair.
async function desligar(sinal) {
  console.log(`\n${sinal} recebido, encerrando...`);
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
}
process.on('SIGINT', () => desligar('SIGINT'));
process.on('SIGTERM', () => desligar('SIGTERM'));
