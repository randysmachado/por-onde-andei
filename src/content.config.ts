import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const local = defineCollection({
  loader: glob({ pattern: '**/index.{md,mdx}', base: './content/local' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      cover: image().optional(),
      location: z.object({
        name: z.string(),
        lat: z.number(),
        lng: z.number(),
        country: z.string().optional(),
      }),
      tags: z.array(z.string()).optional().default([]),
      category: z.string(),
      excerpt: z.string().optional(),
      updatedDate: z.coerce.date().optional(),
      draft: z.boolean().optional().default(false),
    }),
});

export const collections = { local };
