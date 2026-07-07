import { Erros } from '../utils/errors.js';

// Autoriza por tipo de usuário. Ex.: exigirRole('gerente'), exigirRole('recepcao','gerente').
// Hierarquia da reunião: recepcao (CRUD alunos, check-in, visão geral) < gerente (tudo).
export function exigirRole(...tipos) {
  return (req, _res, next) => {
    if (!tipos.includes(req.usuario.tipo)) throw Erros.semPermissao();
    next();
  };
}

// Atalhos comuns.
export const soAluno = exigirRole('aluno');
export const soParceiro = exigirRole('parceiro');
export const soAdmin = exigirRole('recepcao', 'gerente');
export const soGerente = exigirRole('gerente');
export const soSuperadmin = exigirRole('superadmin');
