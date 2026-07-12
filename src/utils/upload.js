import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { Erros } from './errors.js';

const LOGOS_DIR = path.join(env.UPLOAD_DIR, 'logos');
fs.mkdirSync(LOGOS_DIR, { recursive: true });

// image/svg+xml de propósito NÃO está na lista: SVG pode carregar <script>/handlers e
// vira XSS se servido/renderizado como veio do usuário.
const MIME_PARA_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const storage = multer.diskStorage({
  destination: LOGOS_DIR,
  filename(req, file, cb) {
    const ext = MIME_PARA_EXT[file.mimetype];
    // academia_id no nome: cada academia sobrescreve seu próprio arquivo, não acumula lixo.
    cb(null, `${req.usuario.academia_id}-${Date.now()}.${ext}`);
  },
});

const multerUploadLogo = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — logo não precisa de mais que isso
  fileFilter(req, file, cb) {
    cb(null, !!MIME_PARA_EXT[file.mimetype]);
  },
}).single('logo');

// Normaliza qualquer falha do multer (tipo inválido, arquivo grande demais) em AppError,
// pro errorHandler central responder direito em vez de vazar erro genérico.
export function uploadLogo(req, res, next) {
  multerUploadLogo(req, res, (err) => {
    if (err) return next(Erros.arquivoInvalido('Envie uma imagem PNG, JPG ou WEBP de até 2MB.'));
    if (!req.file) return next(Erros.arquivoInvalido('Nenhum arquivo enviado.'));
    next();
  });
}

export function urlPublicaLogo(filename) {
  return `${env.UPLOAD_PUBLIC_URL}/logos/${filename}`;
}
