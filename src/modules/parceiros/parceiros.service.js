import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { gerarCodigoCurto } from '../../utils/crypto.js';
import { registrar } from '../../utils/auditoria.js';
import { Erros } from '../../utils/errors.js';

// ===================== CATEGORIAS (admin/gerente) =====================
export const listarCategorias = (dbh) =>
  dbh('categorias_parceiros').orderBy('ordem', 'asc').orderBy('nome', 'asc');

export async function criarCategoria(dbh, ator, dados) {
  const [c] = await dbh('categorias_parceiros')
    .insert({ ...dados, academia_id: ator.academia_id })
    .returning('*');
  return c;
}

export async function atualizarCategoria(dbh, id, dados) {
  const [c] = await dbh('categorias_parceiros').where({ id }).update(dados).returning('*');
  if (!c) throw Erros.naoEncontrado('Categoria');
  return c;
}

export async function removerCategoria(dbh, id) {
  const n = await dbh('categorias_parceiros').where({ id }).del();
  if (!n) throw Erros.naoEncontrado('Categoria');
}

// ===================== PARCEIROS (admin/gerente) =====================
export const listarParceirosAdmin = (dbh) => dbh('parceiros').orderBy('nome', 'asc');

// Cria o parceiro e, se vier `login`, o usuário lojista (tipo='parceiro', senha "123").
export async function criarParceiro(dbh, ator, dados, req) {
  const { login, ...parceiro } = dados;

  let usuarioLogin = null;
  if (login) {
    const senhaHash = await bcrypt.hash('123', 10);
    const [u] = await dbh('usuarios')
      .insert({
        academia_id: ator.academia_id,
        tipo: 'parceiro',
        nome: parceiro.nome,
        matricula: login, // lojista entra por este "login" + senha
        senha_hash: senhaHash,
      })
      .returning('id');
    usuarioLogin = u.id;
  }

  const [p] = await dbh('parceiros')
    .insert({ ...parceiro, academia_id: ator.academia_id, usuario_login: usuarioLogin })
    .returning('*');

  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'cria_parceiro',
    entidade: 'parceiro',
    entidadeId: p.id,
    detalhes: { nome: p.nome, login: login ?? null },
    req,
  });
  return p;
}

export async function atualizarParceiro(dbh, id, dados) {
  const { login, ...campos } = dados;
  const [p] = await dbh('parceiros').where({ id }).update(campos).returning('*');
  if (!p) throw Erros.naoEncontrado('Parceiro');
  return p;
}

export async function removerParceiro(dbh, id) {
  const n = await dbh('parceiros').where({ id }).del();
  if (!n) throw Erros.naoEncontrado('Parceiro');
}

// ===================== CATÁLOGO (aluno) =====================
export function listarCatalogo(dbh, { categoria = null }) {
  const q = dbh('parceiros as p')
    .leftJoin('categorias_parceiros as c', 'c.id', 'p.categoria_id')
    .where('p.ativo', true)
    .orderBy('p.nome', 'asc')
    .select(
      'p.id',
      'p.nome',
      'p.logo_url',
      'p.tipo_beneficio',
      'p.valor_desconto',
      'p.categoria_id',
      'c.nome as categoria_nome',
    );
  if (categoria) q.where('p.categoria_id', categoria);
  return q;
}

export async function detalheParceiro(dbh, id) {
  const p = await dbh('parceiros')
    .where({ id, ativo: true })
    .first('id', 'nome', 'logo_url', 'tipo_beneficio', 'valor_desconto', 'descricao', 'endereco', 'regras', 'limite_uso');
  if (!p) throw Erros.naoEncontrado('Parceiro');
  return p;
}

// Gera o código de benefício (aluno mostra ao lojista). TTL curto; respeita limite_uso.
export async function gerarBeneficio(dbh, aluno, parceiroId) {
  const parceiro = await dbh('parceiros').where({ id: parceiroId, ativo: true }).first('id', 'limite_uso');
  if (!parceiro) throw Erros.naoEncontrado('Parceiro');

  // Anti-abuso por janela (limite_uso). Conta usos CONFIRMADOS na janela.
  const janela = { '1_dia': '1 day', '1_semana': '7 days' }[parceiro.limite_uso];
  if (janela) {
    const [{ n }] = await dbh('usos_beneficio')
      .where({ aluno_id: aluno.id, parceiro_id: parceiroId, status: 'confirmado' })
      .andWhereRaw(`confirmado_em > now() - interval '${janela}'`)
      .count({ n: '*' });
    if (Number(n) > 0) throw Erros.limiteBeneficio();
  }

  // Gera código único entre os ativos (índice parcial). Poucas tentativas bastam.
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const codigo = gerarCodigoCurto(6);
    try {
      const [uso] = await dbh('usos_beneficio')
        .insert({
          aluno_id: aluno.id,
          parceiro_id: parceiroId,
          academia_id: aluno.academia_id,
          codigo,
          status: 'gerado',
          expira_em: dbh.raw(`now() + interval '${env.BENEFICIO_TTL_SEGUNDOS} seconds'`),
        })
        .returning(['codigo', 'expira_em']);
      return uso;
    } catch (e) {
      if (e.code === '23505' && tentativa < 4) continue; // colisão de código: tenta outro
      throw e;
    }
  }
}
