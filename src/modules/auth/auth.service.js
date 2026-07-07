import bcrypt from 'bcryptjs';
import { db, comSistema } from '../../config/db.js';
import { assinarSessao } from '../../utils/jwt.js';
import { Erros } from '../../utils/errors.js';

// Heurística simples: só dígitos (com máscara) = CPF; senão, matrícula (BF123456).
function ehCpf(identificador) {
  return /\d/.test(identificador) && !/[a-zA-Z]/.test(identificador);
}

// Hash "descartável" para gastar o mesmo tempo de bcrypt quando o usuário não existe.
// Sem isto, o tempo de resposta revelaria quais matrículas/CPFs são válidos (enumeração).
const HASH_FANTASMA = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Dq.Eq/Q0Qm2iX2nq3l4mE7eR3xY5W';

export async function login({ identificador, senha, manterConectado }) {
  const campo = ehCpf(identificador) ? 'cpf' : 'matricula';
  // Login é cross-tenant (não sabemos a academia antes de achar o usuário) → sistema.
  // Join com academias: academia suspensa (ativo=false) barra o login dos seus usuários
  // (SaaS multi-tenant — inadimplência/suspensão precisa travar acesso de verdade).
  // superadmin é exceção: não pertence a uma academia "de negócio", nunca é barrado por isso.
  const usuario = await comSistema((trx) =>
    trx('usuarios as u')
      .join('academias as a', 'a.id', 'u.academia_id')
      .where(`u.${campo}`, identificador.trim())
      .andWhere('u.ativo', true)
      .andWhere((qb) => qb.where('u.tipo', 'superadmin').orWhere('a.ativo', true))
      .first('u.*'),
  );

  // Compara sempre (contra o hash real ou o fantasma) → tempo constante entre
  // "usuário não existe" e "senha errada". A resposta de erro também é idêntica.
  const ok = await bcrypt.compare(senha, usuario?.senha_hash ?? HASH_FANTASMA);
  if (!usuario || !ok) throw Erros.credenciaisInvalidas();

  const token = assinarSessao(
    { sub: usuario.id, tipo: usuario.tipo, academia_id: usuario.academia_id },
    manterConectado,
  );

  return {
    token,
    precisa_trocar_senha: !usuario.senha_trocada,
    precisa_aceitar_termos: !usuario.termos_aceitos_em,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      tipo: usuario.tipo,
      matricula: usuario.matricula,
    },
  };
}

// Self-service pós-login: age só na própria linha (id do JWT) → sistema (bypass RLS).
export async function trocarSenha(usuarioId, { senhaAtual, novaSenha }) {
  const usuario = await comSistema((trx) =>
    trx('usuarios').where({ id: usuarioId }).first('senha_hash'),
  );
  if (!usuario) throw Erros.naoEncontrado('Usuário');

  const ok = await bcrypt.compare(senhaAtual, usuario.senha_hash);
  if (!ok) throw Erros.credenciaisInvalidas();

  const hash = await bcrypt.hash(novaSenha, 10);
  await comSistema((trx) =>
    trx('usuarios').where({ id: usuarioId }).update({ senha_hash: hash, senha_trocada: true }),
  );
}

export async function aceitarTermos(usuarioId) {
  await comSistema((trx) =>
    trx('usuarios').where({ id: usuarioId }).update({ termos_aceitos_em: db.fn.now() }),
  );
}

// Inclui a marca da academia (nome/cores/logo): o front só sabe qual academia é
// DEPOIS do login (o login busca a matrícula/CPF cruzando todas as academias), então
// a marca dinâmica só pode ser aplicada a partir daqui — nunca na tela de Login.
export async function me(usuarioId) {
  return comSistema((trx) =>
    trx('usuarios as u')
      .join('academias as a', 'a.id', 'u.academia_id')
      .where('u.id', usuarioId)
      .first(
      'u.id',
      'u.nome',
      'u.tipo',
      'u.matricula',
      'u.cpf',
      'u.telefone',
      'u.email',
      'u.plano',
      'u.data_vencimento',
      'u.saldo_atual',
      'u.pontos_acumulados_vida',
      'u.senha_trocada',
      'u.termos_aceitos_em',
      'a.nome as academia_nome',
      'a.logo_url as academia_logo_url',
      'a.cor_primaria as academia_cor_primaria',
      'a.cor_secundaria as academia_cor_secundaria',
    ),
  );
}
