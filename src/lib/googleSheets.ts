import { google } from "googleapis";
import { randomUUID } from "node:crypto";

export type CommentRow = {
  id: string;
  name: string;
  email: string;
  comment: string;
  parentId: string;
  isAuthor: boolean;
  date: string;
};

const HEADER = ["id", "name", "email", "comment", "parentId", "isAuthor", "date"];

function getAuth() {
  const email = import.meta.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = import.meta.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );
  if (!email || !privateKey) {
    throw new Error("Credenciais da Service Account do Google não configuradas.");
  }
  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetId(): string {
  const id = import.meta.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID não configurado.");
  return id;
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: "v4", auth });
}

async function sheetExists(slug: string): Promise<boolean> {
  const sheets = await getSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: getSheetId(),
  });
  return (
    spreadsheet.data.sheets?.some((s) => s.properties?.title === slug) ?? false
  );
}

export async function ensureSheetExists(slug: string): Promise<void> {
  if (await sheetExists(slug)) return;

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: getSheetId(),
    requestBody: {
      requests: [{ addSheet: { properties: { title: slug } } }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${slug}!A1:G1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADER] },
  });
}

export async function appendComment(
  slug: string,
  row: Omit<CommentRow, "id">,
): Promise<CommentRow> {
  await ensureSheetExists(slug);
  const sheets = await getSheetsClient();

  // Escreve numa linha específica (calculada a partir das linhas já
  // preenchidas) em vez de usar values.append: o append deixa a API do
  // Sheets "adivinhar" onde a tabela termina, e para uma aba recém-criada
  // isso pode ler o cabeçalho antes dele terminar de ser gravado — fazendo
  // o primeiro comentário cair na linha 1 e o cabeçalho nunca aparecer.
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${slug}!A:A`,
  });
  const nextRow = (existing.data.values?.length ?? 1) + 1;

  const id = randomUUID();
  await sheets.spreadsheets.values.update({
    spreadsheetId: getSheetId(),
    range: `${slug}!A${nextRow}:G${nextRow}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [id, row.name, row.email, row.comment, row.parentId, row.isAuthor ? "true" : "", row.date],
      ],
    },
  });

  return { id, ...row };
}

export async function readComments(slug: string): Promise<CommentRow[]> {
  if (!(await sheetExists(slug))) return [];

  const sheets = await getSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: `${slug}!A2:G`,
  });
  const rows = result.data.values ?? [];
  return rows.map(([id, name, email, comment, parentId, isAuthor, date]) => ({
    id: id ?? "",
    name: name ?? "",
    email: email ?? "",
    comment: comment ?? "",
    parentId: parentId ?? "",
    isAuthor: (isAuthor ?? "").toLowerCase() === "true",
    date: date ?? "",
  }));
}
