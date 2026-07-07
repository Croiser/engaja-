// Registro dos jobs cron. Chamado no boot (server.js) fora do ambiente de teste.
import cron from 'node-cron';
import { ledger, selos } from '../engine/index.js';
import { validarCheckinsPendentes } from '../engine/checkin.js';
import {
  resetarStreaksQuebrados,
  creditarAniversariantes,
  notificarVencimentos,
} from '../engine/jobs_gamificacao.js';

// Envolve um job para logar duração/erros sem derrubar o processo.
function protegido(nome, fn) {
  return async () => {
    const inicio = Date.now();
    try {
      const r = await fn();
      console.log(`[job:${nome}] ok (${Date.now() - inicio}ms)`, r ?? '');
    } catch (err) {
      console.error(`[job:${nome}] ERRO`, err);
    }
  };
}

export function registrarJobs() {
  // Valida check-ins com +48h → credita +10 e reavalia selos. A cada hora.
  cron.schedule('0 * * * *', protegido('validar-checkins', () => validarCheckinsPendentes(ledger, selos)));

  // Diário 00:05 — aniversariantes ganham +300.
  cron.schedule('5 0 * * *', protegido('aniversarios', creditarAniversariantes));

  // Diário 00:10 — zera streaks quebrados (quem faltou ontem).
  cron.schedule('10 0 * * *', protegido('reset-streaks', resetarStreaksQuebrados));

  // Diário 06:00 — notifica alunos com clube vencendo em 7 e 3 dias (mural + push).
  cron.schedule('0 6 * * *', protegido('notif-vencimento', notificarVencimentos));

  console.log('⏰ jobs cron registrados (checkins, aniversarios, streaks, vencimento)');
}
