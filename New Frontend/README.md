# E-Vigilance — staff panel

React 19, Vite, Tailwind CSS 4, JavaScript (type-checked with JSDoc). Plan:
[docs/18](../docs/18-new-frontend-plan.md) · roles: [docs/20](../docs/20-roles-v2.md) · to-do:
[TODO.md](../TODO.md).

## Run it

Start the backend first (`New Backend/`, port 4200), then:

```sh
npm install
npm run dev                # http://localhost:5300
```

The dev server forwards `/api` to the backend, so the sign-in cookie stays on one site.

## Scripts

| Script          | Does                                                          |
| --------------- | ------------------------------------------------------------- |
| `npm run dev`   | Development server on port 5300                               |
| `npm run build` | Production build in `dist/`                                   |
| `npm run check` | Lint (including import boundaries), type check and formatting |

## Structure (docs/18 §10)

```
src/
├─ main.jsx          entry point
├─ app/              providers, routes, layouts
├─ ui/               design system — looks only, no business knowledge
├─ domain/           small business-aware pieces shared by features
├─ features/<area>/  one folder per business area; others import only its index.js
├─ lib/              API client, session, permissions
└─ styles/           design tokens (light and dark) and base styles
```

Lint enforces the boundaries: `ui/` never imports the business, `domain/` never imports features,
and features talk to each other only through `index.js`.
