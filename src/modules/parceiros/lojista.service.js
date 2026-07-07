import { Erros } from '../../utils/errors.js';

// Resolve o parceiro do lojista logado (usuarios.tipo='parceiro' ligado a parceiros.usuario_login).
async function parceiroDoLojista(dbh, lojistaId) {
  const p = await dbh('parceiros').where({ usuario_login: lojistaId, ativo: true }).first('id', 'nome', 'tipo_beneficio', 'valor_desconto', 'regras');
  if (!p) throw Erros.semPermissao();
  return p;
}

// Busca um uso 'gerado' e não expirado, do código, PARA o parceiro do lojista.
// (RLS já garante mesma academia; o filtro por parceiro impede uso cruzado.)
async function acharUsoAtivo(dbh, parceiroId, codigo) {
  const uso = await dbh('usos_beneficio')
    .where({ parceiro_id: parceiroId, codigo, status: 'gerado' })
    .andWhereRaw('expira_em > now()')
    .first();
  if (!uso) throw Erros.codigoInvalido();
  return uso;
}

// PASSO 2 — lojista VALIDA (confere quem é o aluno e o benefício). NÃO consome.
export async function validar(dbh, lojista, codigo) {
  const parceiro = await parceiroDoLojista(dbh, lojista.id);
  const uso = await acharUsoAtivo(dbh, parceiro.id, codigo);

  const aluno = await dbh('usuarios')
    .where({ id: uso.aluno_id, ativo: true })
    .first('nome', 'matricula');
  if (!aluno) throw Erros.codigoInvalido();

  return {
    valido: true,
    aluno: { nome: aluno.nome, matricula: aluno.matricula },
    beneficio: {
      tipo: parceiro.tipo_beneficio,
      valor: parceiro.valor_desconto,
      regras: parceiro.regras,
    },
    codigo: uso.codigo,
  };
}

// PASSO 3 — lojista CONFIRMA o uso (só aqui conta no relatório/anti-abuso).
export async function confirmar(dbh, lojista, codigo) {
  const parceiro = await parceiroDoLojista(dbh, lojista.id);
  // Trava o uso e reconfere o estado dentro da transação (evita duas confirmações).
  const uso = await dbh('usos_beneficio')
    .where({ parceiro_id: parceiro.id, codigo, status: 'gerado' })
    .andWhereRaw('expira_em > now()')
    .forUpdate()
    .first();
  if (!uso) throw Erros.codigoInvalido();

  await dbh('usos_beneficio')
    .where({ id: uso.id })
    .update({ status: 'confirmado', confirmado_por: lojista.id, confirmado_em: dbh.fn.now() });

  return { confirmado: true, uso_id: uso.id };
}
