// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import partytown from "@astrojs/partytown";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  site: "https://porondeandei.randys.dev",
  // output continua 'static' (padrão) — desde o Astro v5 ele já suporta
  // rotas server-rendered via `export const prerender = false` por rota
  // (o antigo output: 'hybrid' foi mesclado no 'static'). Só a rota
  // src/pages/api/comments.ts roda sob demanda.
  adapter: vercel(),
  integrations: [
    mdx(),
    sitemap(),
    icon(),
    // Partytown executa scripts de analytics numa web worker,
    // fora do main thread — melhora o desempenho da página.
    partytown({
      config: {
        // Encaminha chamadas dataLayer.push do main thread → web worker
        forward: ["dataLayer.push"],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
