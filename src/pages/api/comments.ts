import type { APIRoute } from "astro";
import { z } from "zod";
import { appendComment, readComments } from "../../lib/googleSheets";
import { verifyTurnstileToken } from "../../lib/turnstile";
import { commentSchema } from "../../lib/commentSchema";

export const prerender = false;

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

  const { slug, turnstileToken } = body;

  if (!slug) {
    return new Response(JSON.stringify({ error: "slug é obrigatório" }), {
      status: 400,
    });
  }

  const parsed = commentSchema.safeParse({
    name: body.name,
    email: body.email,
    comment: body.comment,
  });
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors;
    return new Response(JSON.stringify({ error: "dados inválidos", fieldErrors }), {
      status: 400,
    });
  }
  const { name, email, comment } = parsed.data;

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
    await appendComment(slug, { date, name, email, comment });
  } catch {
    return new Response(
      JSON.stringify({ error: "não foi possível enviar seu comentário, tente novamente" }),
      { status: 500 },
    );
  }

  return new Response(JSON.stringify({ comment: { name, comment, date } }), {
    status: 201,
  });
};
