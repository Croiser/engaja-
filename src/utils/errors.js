// Erros de domínio com código estável (o front reage ao `codigo`, não à mensagem).
export class AppError extends Error {
  constructor(codigo, mensagem, status = 400, detalhes = null) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
    this.detalhes = detalhes; // ex.: lista de campos inválidos (Zod)
  }
}

export const Erros = {
  naoAutenticado: () => new AppError('NAO_AUTENTICADO', 'Sessão inválida ou expirada.', 401),
  semPermissao: () => new AppError('SEM_PERMISSAO', 'Você não tem permissão para isso.', 403),
  setupPendente: () =>
    new AppError('SETUP_PENDENTE', 'Troque a senha e aceite os termos antes de continuar.', 403),
  credenciaisInvalidas: () =>
    new AppError('CREDENCIAIS_INVALIDAS', 'Matrícula/CPF ou senha incorretos.', 401),
  saldoInsuficiente: () =>
    new AppError('SALDO_INSUFICIENTE', 'Saldo de pontos insuficiente.', 422),
  semEstoque: () => new AppError('SEM_ESTOQUE', 'Prêmio sem estoque.', 422),
  naoEncontrado: (o = 'Recurso') => new AppError('NAO_ENCONTRADO', `${o} não encontrado.`, 404),
  checkinDuplicado: () =>
    new AppError('CHECKIN_DUPLICADO', 'Você já fez check-in hoje.', 409),
  codigoInvalido: () =>
    new AppError('CODIGO_INVALIDO', 'Código inválido ou expirado.', 422),
  limiteBeneficio: () =>
    new AppError('LIMITE_BENEFICIO', 'Você já usou este benefício no período permitido.', 422),
};
