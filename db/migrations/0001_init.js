// Migration inicial: aplica o db/schema.sql (fonte única de verdade do schema).
// Mantemos o schema em SQL puro e a migration apenas o executa — evita divergência
// entre "schema declarado" e "schema migrado".
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function up(knex) {
  const sql = await readFile(join(__dirname, '..', 'schema.sql'), 'utf8');
  await knex.raw(sql);
}

export async function down(knex) {
  // Ordem reversa por dependência de FK.
  await knex.raw(`
    DROP TABLE IF EXISTS auditoria_logs, checkins, resgates, premios,
      usos_beneficio, parceiros, categorias_parceiros, indicacoes,
      desafios_progresso, desafios, alunos_selos, selos, pontos_ledger,
      usuarios, academias CASCADE;
  `);
}
