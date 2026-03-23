# vCad Online

vCad Online is a Vue 3 stripboard or veroboard layout editor inspired by VeeCAD, with an editor-first workflow.

## Current Implementation

- Vue 3 + TypeScript + Vite
- Pinia store for board state
- Vue Router with editor-first navigation
- Single offline working project stored in browser local storage
- Secondary projects view for cloud-loaded work
- Initial stripboard canvas with copper strips, links, and external wires

## Routes

- `/` opens the editor immediately
- `/projects` is the cloud projects screen
- `/login` is the placeholder sign-in view
- `/editor/:id` loads a named cloud project into the editor shell

## Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## Near-Term Scope

- Interactive cut, link, and wire placement tools
- Projects backed by Firebase for signed-in users
- Richer export flows beyond direct SVG, PNG, and PDF downloads

## Export

The toolbar now includes an `Export` dropdown for board-output downloads:

- `SVG` exports the live board canvas as vector artwork.
- `PNG` rasterizes the live board canvas for image export.
- `PDF` packages the board output into a downloadable PDF.

Current limitation:

- Export still uses the current rendered board view directly, so future work is still needed for paper sizing, export cleanup, and advanced layout controls.

## KiCad Import

The editor can now import KiCad exported netlists from the toolbar.

Current support:

- KiCad exported XML netlists
- KiCad S-expression netlists
- Nets and component references are loaded into the board state
- Ratsnest overlay uses the imported nets immediately

Current limitation:

- Native `.kicad_sch` schematic parsing is not implemented yet
