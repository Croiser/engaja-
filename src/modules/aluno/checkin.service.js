import { registrarCheckin } from '../../engine/checkin.js';
import { Erros } from '../../utils/errors.js';

// Registra o check-in do aluno logado. `dbh` já vem com contexto de tenant (req.db),
// então tanto a leitura do qr_secret quanto o INSERT ficam isolados por academia.
export async function fazerCheckin(dbh, aluno, { metodo, lat, lng, foto_url, qr_token }) {
  const academia = await dbh('academias').where({ id: aluno.academia_id }).first('qr_secret');
  if (!academia) throw Erros.naoEncontrado('Academia');

  return registrarCheckin(dbh, {
    aluno,
    metodo,
    lat,
    lng,
    fotoUrl: foto_url,
    qrToken: qr_token,
    qrSecret: academia.qr_secret,
  });
  // Não retorna pontos: crédito de +10 só após validação de 48h (job).
}
