# Design: Player de vídeo para os posts (content/local)

**Data:** 2026-08-12
**Status:** Aprovado para virar plano de implementação

## Contexto e problema

O blog (`Por Onde Andei`, Astro estático, hospedado na Vercel) quer permitir vídeos dentro dos posts de `content/local/`, além das fotos que já existem hoje. O autor não quer usar o YouTube para hospedar, e descartou o Mux (recomendado pela própria documentação do Astro para vídeo) por causa do modelo de cobrança por visualização.

A ideia inicial era hospedar os vídeos no Google Photos e usar um player dedicado (Video.js ou Plyr) para exibi-los no site.

### Achado que invalidou a ideia original

Pesquisa nos docs oficiais do Astro (`astro-docs` MCP) e na web confirmou que **o Google Photos não oferece uma URL direta e estável para um arquivo de vídeo**. O link de compartilhamento abre o visualizador do Google Photos (dependente de JS do próprio Google), não expõe um `.mp4`/HLS público. Existem ferramentas de terceiros que tentam extrair esse link (ex. publicalbum.org, ctrlq.org), mas não são suportadas oficialmente pelo Google, podem parar de funcionar a qualquer atualização do produto, e nenhum player HTML5 (Video.js, Plyr ou qualquer outro) consegue tocar isso de forma confiável. **Google Photos foi descartado como origem do arquivo de vídeo.**

Isso significa que o problema real a resolver não é "qual player" (essa parte é simples — qualquer player HTML5 toca uma URL de vídeo pública), e sim **onde hospedar o arquivo de vídeo em si**, sem reintroduzir o mesmo problema que fez descartar o Mux (custo atrelado a visualização/banda).

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Hospedagem do arquivo de vídeo | **Cloudflare R2** | Egress (banda de saída) gratuito em qualquer volume — elimina de vez a preocupação com custo por visualização que descartou o Mux. Free tier: 10GB de armazenamento grátis; acima disso, US$0,015/GB-mês *só* de armazenamento, sem cobrança de entrega. |
| URL pública do bucket | `pub-<hash>.r2.dev` (domínio padrão do R2) | O DNS do domínio do site (`randys.dev`) não está na Cloudflare hoje. Domínio próprio (ex. `videos.randys.dev`) exigiria delegar o NS desse subdomínio pra Cloudflare — fica documentado como upgrade futuro, não faz parte deste trabalho. |
| Player | **Plyr** | ~20KB gzip vs. ~40KB do Video.js (v8, versão estável atual). API simples para vídeo HTML5 puro, fácil de estilizar via CSS custom properties — mesmo padrão que o projeto já usa para customizar o Leaflet (`InteractiveMap`) e o `<dialog>` da galeria (`Gallery.astro`). Video.js foi descartado por trazer complexidade (streaming adaptativo, plugins, Chromecast) que este blog não precisa para clipes MP4 simples. |
| Onde declarar o vídeo no post | **Componente no corpo do MDX**, não no frontmatter | Mantém a mesma separação que já existe no projeto entre "onde o arquivo mora" (hoje: filesystem local pra fotos) e "como é exibido" (`Gallery.astro`). Vídeo é opt-in por post; não exige mudança no schema Zod de `content.config.ts`. |
| Upload dos vídeos pro bucket | Manual (dashboard Cloudflare ou `wrangler r2 object put`) | Mesmo esforço que hoje já existe pra soltar fotos numa pasta — não compensa automatizar para o volume de vídeos de um blog pessoal. |

## Arquitetura

Dois pedaços independentes, sem acoplamento entre si:

1. **Armazenamento** — bucket R2 público (somente leitura), fora do repositório Git e fora do fluxo de build do Astro.
2. **Exibição** — um componente Astro, `VideoPlayer.astro`, usado no corpo do `.mdx` do post. Ele só recebe uma URL de vídeo via prop; não sabe nada sobre R2.

```
content/local/cachoeira-da-iracema/index.mdx
  └── <VideoPlayer src="https://pub-xxxx.r2.dev/cachoeira-da-iracema/trilha.mp4" ... />
                                          │
                                          ▼
                        Bucket R2 (por-onde-andei-videos)
                        cachoeira-da-iracema/trilha.mp4
```

## Componente `VideoPlayer.astro`

Local: `src/components/VideoPlayer.astro`

**Props** (via `interface Props`, seguindo o padrão dos outros componentes do projeto):

```typescript
interface Props {
  src: string;           // URL pública do vídeo no R2
  poster?: string;       // caminho de imagem local (ex. ./cover.jpg), otimizada via astro:assets
  title: string;         // usado como aria-label / legenda, obrigatório por acessibilidade
  sources?: {             // opcional — múltiplas qualidades/formatos
    src: string;
    type: string;
    size?: number;
  }[];
}
```

**Implementação:**
- Markup: `<video>` HTML5 nativo com `<source>` (mesma estrutura recomendada pela doc oficial do Plyr), sem iframe.
- Inicialização: `import Plyr from 'plyr'` dentro de um `<script>` do componente (bundlado pelo Vite — mesmo padrão do `import L from 'leaflet'` em `InteractiveMap.astro`).
- Estilo: `plyr.css` importado e sobrescrito no `global.css`, reaproveitando os tokens de cor já existentes (`--panel`, `--accent`, `--ink`, `--line`) para o player ficar visualmente coerente com o tema escuro do site — mesmo tratamento já dado ao Leaflet e ao lightbox da galeria.
- Sem novas dependências de schema: `content.config.ts` não muda.

**Uso num post:**

```mdx
import VideoPlayer from '../../../src/components/VideoPlayer.astro'

## A trilha

<VideoPlayer
  src="https://pub-xxxx.r2.dev/cachoeira-da-iracema/trilha.mp4"
  poster="./cover.jpg"
  title="Trilha até a Cachoeira da Iracema"
/>
```

> Nota: `pub-xxxx.r2.dev` acima é um placeholder ilustrativo — a URL real só existe depois que o bucket for criado na implementação; não é um dado fictício de produção, é a forma padrão como o R2 nomeia URLs públicas.

## Armazenamento no R2 — detalhes

- **Bucket:** um único bucket público de leitura, ex. `por-onde-andei-videos`.
- **Convenção de nomes:** espelha a estrutura de `content/local/` para facilitar localizar o arquivo certo: `<slug-do-local>/<nome-do-video>.mp4` (ex.: `cachoeira-da-iracema/trilha.mp4`). É só uma convenção de organização dentro do bucket, sem sincronismo automático com o Git — o autor sobe o arquivo manualmente e cola a URL no MDX.
- **Acesso:** leitura pública habilitada no bucket (sem listagem de diretório), sem exigir chave de API no client.
- **Upgrade futuro (fora de escopo agora):** domínio próprio tipo `videos.randys.dev` no lugar do `pub-xxxx.r2.dev`, exigindo delegar o NS desse subdomínio pra Cloudflare.

## Erros e casos de borda

- URL de vídeo quebrada/indisponível: o comportamento nativo do elemento `<video>` (ícone de erro do browser) é suficiente — não vale a pena construir um fallback customizado para o volume de tráfego de um blog pessoal.
- Sem streaming adaptativo (HLS/DASH): fora de escopo — os vídeos são clipes MP4 diretos, servidos como arquivo único. Se um dia isso for necessário, é motivo pra reabrir a decisão do player (ver alternativa Video.js descartada acima).

## Testes / verificação

O projeto não tem suíte de testes automatizados. Verificação será manual, no `npm run dev`, por post com vídeo:
- O player carrega e mostra o poster antes do play.
- Play/pause, barra de progresso, volume e tela cheia funcionam.
- Responsivo em mobile (largura do viewport reduzida).
- Estilo visualmente coerente com o tema escuro do site.

## Fora de escopo

- Domínio próprio para o R2 (`videos.randys.dev`).
- Automação de upload (CI, script de sincronismo).
- Streaming adaptativo / múltiplas resoluções automáticas.
- Qualquer mudança em `content.config.ts`.
