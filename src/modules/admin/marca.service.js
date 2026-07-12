import { registrar } from '../../utils/auditoria.js';
import { Erros } from '../../utils/errors.js';

// Nunca devolver `qr_secret` pro front — é o segredo que assina os QR codes da
// carteirinha (ver engine/checkin.js). Vazar isso permitiria forjar carteirinhas válidas.
const COLUNAS_PUBLICAS = ['id', 'nome', 'slug', 'dominio', 'logo_url', 'cor_primaria', 'cor_secundaria', 'ativo', 'criado_em'];

// Autoatendimento: dbh já roda sob comTenantHandler (RLS por academia_id=id), então
// nunca precisa filtrar por id explicitamente — a política de RLS já restringe à
// própria academia do gerente logado.
export async function obterMinhaAcademia(dbh) {
  const academia = await dbh('academias').first(COLUNAS_PUBLICAS);
  if (!academia) throw Erros.naoEncontrado('Academia');
  return academia;
}

export async function atualizarMinhaMarca(dbh, ator, dados, req) {
  const [academia] = await dbh('academias').update(dados).returning(COLUNAS_PUBLICAS);
  if (!academia) throw Erros.naoEncontrado('Academia');
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'edita_marca',
    entidade: 'academia',
    entidadeId: ator.academia_id,
    detalhes: dados,
    req,
  });
  return academia;
}

export async function atualizarMinhaLogo(dbh, ator, logoUrl, req) {
  const [academia] = await dbh('academias').update({ logo_url: logoUrl }).returning(COLUNAS_PUBLICAS);
  if (!academia) throw Erros.naoEncontrado('Academia');
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'edita_logo',
    entidade: 'academia',
    entidadeId: ator.academia_id,
    detalhes: { logo_url: logoUrl },
    req,
  });
  return academia;
}
