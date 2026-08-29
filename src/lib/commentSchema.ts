import { z } from "zod";

export const commentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Digite seu nome.")
    .max(80, "Nome muito longo (máximo 80 caracteres)."),
  email: z
    .string()
    .trim()
    .min(1, "Digite seu e-mail.")
    .email("Digite um e-mail válido."),
  comment: z
    .string()
    .trim()
    .min(1, "Escreva um comentário.")
    .max(2000, "Comentário muito longo (máximo 2000 caracteres)."),
});

export type CommentInput = z.infer<typeof commentSchema>;
