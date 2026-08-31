// Script único: migra todas as abas (slugs) da planilha de comentários do
// schema antigo (data, nome, email, comentário) para o novo
// (id, name, email, comment, parentId, isAuthor, date).
// Roda uma vez, direto contra a planilha real, antes do deploy da feature
// de respostas. Não faz parte do fluxo normal da aplicação.
//
// Uso: node scripts/migrate-comments-schema.mjs
// Requer as mesmas env vars usadas pela aplicação (lidas do .env local):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_SHEET_ID

import { google } from "googleapis";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const path = join(__dirname, "..", ".env");
  const env = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const idx = l.indexOf("=");
        let v = l.slice(idx + 1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        return [l.slice(0, idx).trim(), v];
      }),
  );
  return env;
}

const env = loadEnv();
const auth = new google.auth.JWT({
  email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = env.GOOGLE_SHEET_ID;

const NEW_HEADER = ["id", "name", "email", "comment", "parentId", "isAuthor", "date"];
const OLD_HEADER = ["data", "nome", "email", "comentário"];

async function migrateSheet(title) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A1:D`,
  });
  const rows = result.data.values ?? [];
  if (rows.length === 0) {
    console.log(`  (vazia, ignorando)`);
    return;
  }

  const header = rows[0];
  const isOldSchema = OLD_HEADER.every((h, i) => header[i] === h);
  if (!isOldSchema) {
    console.log(`  cabeçalho não é o schema antigo esperado (${JSON.stringify(header)}), pulando`);
    return;
  }

  const dataRows = rows.slice(1);
  // Schema antigo: data, nome, email, comentário
  // Schema novo:   id, name, email, comment, parentId, isAuthor, date
  const migrated = dataRows.map(([date, name, email, comment]) => [
    randomUUID(),
    name ?? "",
    email ?? "",
    comment ?? "",
    "",
    "",
    date ?? "",
  ]);

  const values = [NEW_HEADER, ...migrated];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A1:G${values.length}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });

  // Limpa colunas extras (H em diante não deve sobrar nada, mas colunas
  // antigas D+ não usadas pelo range acima não precisam de limpeza aqui
  // porque o novo schema tem mais colunas, não menos).
  console.log(`  migrada: ${migrated.length} comentário(s)`);
}

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const titles = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t) => !!t);

  for (const title of titles) {
    console.log(`Migrando aba "${title}"...`);
    await migrateSheet(title);
  }
  console.log("Migração concluída.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
