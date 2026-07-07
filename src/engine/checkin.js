// =====================================================================
// Check-in — registra a presença; NÃO credita na hora.
//
// REGRA (reunião): 1 check-in/dia, crédito de +10 pts só após validação de 48h (job).
// Método: geoloc (foto/localização) OU QR fixo da academia. A constraint UNIQUE
// (aluno_id, dia_checkin) no fuso America/Sao_Paulo garante 1x/dia no nível do banco.
// =====================================================================
import { validarQrAcademia } from '../utils/crypto.js';
import { db, comSistema } from '../config/db.js';
import * as ledger from './ledger.js';
import { avaliarSelos } from './selos.js';
import { notificar } from '../utils/notificacoes.js';
import { Erros } from '../utils/errors.js';

const PONTOS_CHECKIN = 10;
// Bônus de streak (além dos 10/dia). Reunião: 7 dias = +100, 30 dias = +500.
const BONUS_STREAK = { 7: 100, 30: 500 };

/**
 * Registra um check-in (validado=false). O crédito ocorre no job de 48h.
 * Recebe `trx` para compor com outras operações se necessário.
 */
export async function registrarCheckin(trx, { aluno, metodo, lat, lng, fotoUrl, qrToken, qrSecret }) {
  if (metodo === 'qr') {
    if (!validarQrAcademia(qrToken, aluno.academia_id, qrSecret)) throw Erros.codigoInvalido();
  } else if (metodo === 'geoloc') {
    if (lat == null || lng == null) throw Erros.codigoInvalido();
    // Cerca geográfica (raio da academia) fica para config por tenant — TODO Fase 2.5.
  }

  // Pré-checagem amigável (a constraint do banco é a garantia real anti-corrida).
  const hoje = await trx('checkins')
    .where({ aluno_id: aluno.id })
    .andWhereRaw(`dia_checkin = (now() AT TIME ZONE 'America/Sao_Paulo')::date`)
    .first('id');
  if (hoje) throw Erros.checkinDuplicado();

  const [checkin] = await trx('checkins')
    .insert({
      aluno_id: aluno.id,
      academia_id: aluno.academia_id,
      metodo,
      lat: lat ?? null,
      lng: lng ?? null,
      foto_url: fotoUrl ?? null,
      validado: false,
    })
    .returning(['id', 'criado_em']);

  // Atualiza o streak no fuso do negócio: +1 se veio de ontem, mantém se já contou
  // hoje, reinicia em 1 caso contrário. streak_maior guarda o recorde.
  const [u] = await trx('usuarios')
    .where({ id: aluno.id })
    .update({
      streak_atual: trx.raw(`CASE
        WHEN ultimo_checkin_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN streak_atual
        WHEN ultimo_checkin_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1 THEN streak_atual + 1
        ELSE 1 END`),
      ultimo_checkin_dia: trx.raw(`(now() AT TIME ZONE 'America/Sao_Paulo')::date`),
    })
    .returning('streak_atual');
  const streak = u.streak_atual;
  await trx('usuarios')
    .where({ id: aluno.id })
    .update({ streak_maior: trx.raw('GREATEST(streak_maior, ?)', [streak]) });

  // Bônus de milestone (creditado na hora; separado dos 10/dia que validam em 48h).
  let bonus = 0;
  if (BONUS_STREAK[streak]) {
    bonus = BONUS_STREAK[streak];
    await ledger.creditar(trx, {
      alunoId: aluno.id,
      academiaId: aluno.academia_id,
      tipoEvento: 'streak',
      quantidade: bonus,
      descricao: `Bônus de ${streak} dias consecutivos`,
      refId: checkin.id,
      validado: true,
    });
  }
  // Reavalia selos (cobre selos de critério 'streak').
  const novosSelos = await avaliarSelos(trx, aluno.id);

  return { ...checkin, streak, bonus, novosSelos };
}

/**
 * JOB (a cada hora): valida check-ins com +48h e credita +10 pts.
 * Roda em contexto de SISTEMA (bypass RLS) — varre todas as academias.
 * Idempotente: só pega validado=false e faz tudo na mesma transação por check-in.
 * Retorna quantos foram creditados.
 */
export async function validarCheckinsPendentes(ledger, selos) {
  // Leitura cross-tenant → contexto de sistema.
  const pendentes = await comSistema((trx) =>
    trx('checkins')
      .where({ validado: false })
      .andWhereRaw(`criado_em < now() - interval '48 hours'`)
      .select('id', 'aluno_id', 'academia_id'),
  );

  let creditados = 0;
  for (const c of pendentes) {
    await db.transaction(async (trx) => {
      await trx.raw(`SELECT set_config('app.bypass', 'on', true)`); // sistema dentro da tx
      // Trava o check-in; se outro worker já validou, sai sem creditar em dobro.
      const alvo = await trx('checkins')
        .where({ id: c.id, validado: false })
        .forUpdate()
        .first('id');
      if (!alvo) return;

      await trx('checkins').where({ id: c.id }).update({ validado: true });
      await ledger.creditar(trx, {
        alunoId: c.aluno_id,
        academiaId: c.academia_id,
        tipoEvento: 'check_in',
        quantidade: PONTOS_CHECKIN,
        descricao: 'Check-in validado (48h)',
        refId: c.id,
        validado: true,
      });
      await selos.avaliarSelos(trx, c.aluno_id);
      await notificar(trx, {
        usuarioId: c.aluno_id,
        academiaId: c.academia_id,
        tipo: 'pontos',
        titulo: 'Pontos do check-in liberados ✅',
        corpo: `Seus ${PONTOS_CHECKIN} pontos do check-in foram creditados.`,
        url: '/me/pontos',
      });
      creditados++;
    });
  }
  return creditados;
}
