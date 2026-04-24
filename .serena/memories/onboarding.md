# Project Overview
- Purpose: Amazon to eBay Cross-Listing Tool. Crawls Amazon products, processes the data, maps it to eBay categories, and exports it as a CSV compatible with eBay File Exchange.
- Tech Stack: Electron, Vue 3, Vite (electron-vite), Tailwind CSS, shadcn/ui (reka-ui), better-sqlite3 for caching, playwright for crawling.
- Code Style: Prettier & ESLint configured. Uses Vue Composition API. 

# Commands
- Dev Server: `npm run dev`
- Build: `npm run build`
- Format: `npm run format`
- Lint: `npm run lint`

# Architecture
- `src/main`: Electron main process (Node.js backend with SQLite, Playwright).
- `src/renderer`: Vue 3 frontend app.
  - `src/renderer/src/App.vue`: Main layout and state.
  - `src/renderer/src/components`: UI components (`Queue`, `Workspace`, `ExportPreview`, `DetailPanel`, `Settings`).
- Local caching is handled by `better-sqlite3` storing eBay category taxonomy.