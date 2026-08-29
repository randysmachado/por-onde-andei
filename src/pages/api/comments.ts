import type { APIRoute } from "astro";
import { appendComment, readComments } from "../../lib/googleSheets";
import { verifyTurnstileToken } from "../../lib/turnstile";

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 80;
const MAX_COMMENT_LEN = 2000;

export const GET: APIRoute = async ({ url }) => {
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return new Response(JSON.stringify({ error: "slug é obrigatório" }), {
      status: 400,
    });
  }

  const rows = await readComments(slug);
  const comments = rows.map((r) => ({
    name: r.name,
    comment: r.comment,
    date: r.date,
  }));
  return new Response(JSON.stringify({ comments }), { status: 200 });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: {
    slug?: string;
    name?: string;
    email?: string;
    comment?: string;
    turnstileToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
    });
  }

  const { slug, name, email, comment, turnstileToken } = body;

  if (!slug || !name?.trim() || !comment?.trim() || !email?.trim()) {
    return new Response(
      JSON.stringify({ error: "nome, email e comentário são obrigatórios" }),
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return new Response(JSON.stringify({ error: "email inválido" }), {
      status: 400,
    });
  }
  if (name.length > MAX_NAME_LEN || comment.length > MAX_COMMENT_LEN) {
    return new Response(JSON.stringify({ error: "campo excede o tamanho máximo" }), {
      status: 400,
    });
  }
  if (!turnstileToken) {
    return new Response(JSON.stringify({ error: "captcha ausente" }), {
      status: 403,
    });
  }

  let turnstileOk: boolean;
  try {
    turnstileOk = await verifyTurnstileToken(turnstileToken, clientAddress);
  } catch {
    return new Response(
      JSON.stringify({ error: "não foi possível validar o captcha" }),
      { status: 500 },
    );
  }
  if (!turnstileOk) {
    return new Response(JSON.stringify({ error: "captcha inválido" }), {
      status: 403,
    });
  }

  const date = new Date().toISOString();
  try {
    await appendComment(slug, {
      date,
      name: name.trim(),
      email: email.trim(),
      comment: comment.trim(),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "não foi possível enviar seu comentário, tente novamente" }),
      { status: 500 },
    );
  }

  return new Response(
    JSON.stringify({ comment: { name: name.trim(), comment: comment.trim(), date } }),
    { status: 201 },
  );
};
