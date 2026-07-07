import { z } from 'zod';

export const loginSchema = z.object({
  identificador: z.string().min(1, 'Informe matrícula ou CPF'),
  senha: z.string().min(1, 'Informe a senha'),
  manter_conectado: z.boolean().optional().default(false),
});

export const trocarSenhaSchema = z.object({
  senha_atual: z.string().min(1),
  // Senha padrão "123" é curta de propósito; a nova exige mínimo real.
  nova_senha: z.string().min(6, 'A nova senha deve ter ao menos 6 caracteres'),
});
