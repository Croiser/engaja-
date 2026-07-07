// Registro de auditoria de ações MANUAIS (ajuste de pontos, exclusão/cancelamento de
// aluno, CRUD sensível). Check-in automático NÃO gera auditoria (regra da reunião).
// Sempre chamado DENTRO da transação do efeito → log e ação nunca dessincronizam.
//
// `req` opcional só para capturar IP/user-agent (rastreabilidade). Passar `dbh` (req.db/trx).
export async function registrar(dbh, { academiaId, usuarioId, acao, entidade, entidadeId, detalhes, req }) {
  await dbh('auditoria_logs').insert({
    academia_id: academiaId,
    usuario_id: usuarioId ?? null,
    acao,
    entidade: entidade ?? null,
    entidade_id: entidadeId ?? null,
    detalhes: detalhes ? JSON.stringify(detalhes) : null,
    ip_origem: req?.ip ?? null,
    user_agent: req?.headers?.['user-agent'] ?? null,
  });
}
