import crypto from 'node:crypto';

// HMAC do QR FIXO da academia (impresso na recepção). O token codifica o academia_id
// e é assinado com academias.qr_secret. O check-in por QR recomputa e compara — sem
// precisar de banco de "QRs válidos". Formato do payload lido pelo app: "<academiaId>.<sig>".
export function assinarQrAcademia(academiaId, qrSecret) {
  const sig = crypto.createHmac('sha256', qrSecret).update(academiaId).digest('hex');
  return `${academiaId}.${sig}`;
}

export function validarQrAcademia(token, academiaId, qrSecret) {
  const esperado = assinarQrAcademia(academiaId, qrSecret);
  // Comparação em tempo constante (evita timing attack).
  const a = Buffer.from(token || '');
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Código curto p/ voucher de resgate e código de benefício de parceiro.
export function gerarCodigoCurto(tamanho = 6) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I (legibilidade)
  let out = '';
  for (let i = 0; i < tamanho; i++) {
    out += alfabeto[crypto.randomInt(alfabeto.length)];
  }
  return out;
}
