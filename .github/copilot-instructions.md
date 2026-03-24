# Project Guidelines

## Development Workflow

- Prefer focused, incremental changes that preserve the editor-first workflow.
- Treat offline mode as one current working project only; do not add a local multi-project manager unless explicitly requested.
- Keep cloud project features secondary to the editor surface.
- Firebase is optional for development: offline mode should continue working when Firebase env vars are not configured.

## Build And Run

- Install: `npm install`
- Dev server: `npm run dev` (workspace task uses `npm run dev -- --host`)
- Build and type-check: `npm run build`
- Preview production build: `npm run preview`
- Deploy hosting + Firestore rules: `npm run deploy`
- There is no dedicated lint/test script yet; rely on TypeScript checks and targeted validation for changed flows.

## Architecture

- Use Vue 3 Composition API with TypeScript and Pinia stores.
- Keep board state centralized in `src/stores/board.ts`; avoid duplicating canonical board state in component-local stores.
- Preserve component boundaries in `src/components/editor/`:
	- `BoardCanvas.vue`: stripboard rendering and interaction
	- `AppToolbar.vue`: tool actions, import/export, project actions
	- `InspectorPanel.vue`: selected-item editing
	- `StatusBar.vue`: connectivity and save status feedback
- Keep domain logic in `src/lib/` (connectivity, footprints, import/export, offline/cloud queues), not in view components.

## Conventions

- Preserve terminology: links are on-board jumpers, wires are external signal connections.
- Maintain the warm stripboard-inspired palette; avoid dark-mode-first visual choices unless the design direction changes.
- Prefer editor-first navigation and behavior (`/` opens the editor directly).
- KiCad import support is netlist-focused; avoid implying full `.kicad_sch` connectivity extraction.

## Reference Docs

- See `README.md` for routes, Firebase setup, deployment details, and current feature limitations.
- See `firestore.rules` for cloud authorization boundaries.