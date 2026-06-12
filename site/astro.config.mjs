// @ts-check
import { defineConfig } from 'astro/config';

// Sitio estático bilingüe: español en `/` (default) e inglés en `/en/`.
export default defineConfig({
  site: 'https://copm.juansac.dev',
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
