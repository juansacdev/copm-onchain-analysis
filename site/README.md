# COPM — Storytelling site

Sitio estático en [Astro](https://astro.build) que cuenta la auditoría on-chain de COPM como historia. Bilingüe: español en `/` (default) e inglés en `/en/`. Dominio: [copm.juansac.dev](https://copm.juansac.dev).

Los charts SVG **no viven aquí**: se generan con el pipeline del repo (`npm run audit:all` en la raíz) y quedan en `../charts/`. Las páginas los importan con `?raw` en build time, así que regenerar los charts y recompilar el sitio basta para actualizarlos.

## Comandos

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # genera dist/
npm run preview   # sirve dist/ localmente
```

## Estructura

```
src/
├── layouts/Base.astro        # head, hreflang, barra de progreso, reveal-on-scroll
├── components/
│   ├── SideNav.astro         # navegación lateral de capítulos + scrollspy
│   ├── Hero.astro            # portada con stats (<dl>)
│   ├── Chapter.astro         # <section> de capítulo con label y título
│   ├── ChartFigure.astro     # <figure> con SVG inline del pipeline
│   ├── BigNum.astro          # número gigante por capítulo
│   ├── Note.astro            # callouts (<aside>)
│   ├── Quote.astro           # cita con atribución (<blockquote> + <figcaption>)
│   ├── Steps.astro           # pasos del método (<ol>)
│   ├── Checks.astro          # checks de validación (<ul>)
│   ├── Glossary.astro        # glosario (<details>)
│   ├── SiteFooter.astro      # footer con enlaces
│   └── LangSwitch.astro      # selector ES/EN
├── pages/
│   ├── index.astro           # versión en español
│   └── en/index.astro        # versión en inglés
└── styles/global.css         # estilos compartidos (tipografía, layout, tokens)
```
