// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import partytown from "@astrojs/partytown";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://porondeandei.randys.dev",
  integrations: [
    mdx(),
    sitemap(),
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
