# vCad Online

vCad Online is a Vue 3 stripboard or veroboard layout editor inspired by VeeCAD, with an editor-first workflow.

## Current Implementation

- Vue 3 + TypeScript + Vite
- Pinia store for board state
- Vue Router with editor-first navigation
- Single offline working project stored in browser local storage
- Firebase Auth and Firestore-backed cloud projects
- Deferred cloud project creation: authenticated empty boards stay local until the first real placement
- Cloud projects view with rename, delete, and share controls
- Shared read-only project links
- Offline queue for retrying cloud saves when connectivity returns
- Initial stripboard canvas with copper strips, links, and external wires

## Routes

- `/` opens the editor immediately
- `/projects` is the cloud projects screen
- `/login` handles Google and email/password authentication
- `/editor/:id` loads a named cloud project into the editor shell
- `/share/:token` opens a read-only shared project

## Editor And Storage Flow

- Guest users work in a single offline browser-stored board.
- Signed-in users still start on the editor first.
- A new authenticated board does not create a cloud project immediately.
- The first real board content placement migrates that local board into a Firestore-backed cloud project.
- Empty cloud projects are labeled as `Cloud project (empty)` in the projects screen.
- Deleting a project from the projects screen also clears any matching active editor state and queued autosave entry.

## Authentication And Cloud Projects

- Cloud project routes require authentication.
- Google sign-in and email/password sign-in are implemented.
- Cloud projects support:
	- rename
	- delete
	- enable/disable share links
	- read-only shared project viewing

## Firebase Setup

Set the following environment variables before using online mode:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

You can copy the checked-in template and fill in your Firebase values:

```bash
cp .env.example .env
```

Cloud mode is disabled until all of these values are present.

## Firestore Rules

Firestore rules live in `firestore.rules`, with `firebase.json` configured to deploy them.

Deploy rules with:

```bash
npx firebase deploy --only firestore:rules --project <your-project-id>
```

Deploy the app and rules together with:

```bash
npm run deploy
```

Current rules allow:

- owners to create, read, update, and delete their own `/projects/{projectId}` documents
- public read-only access to `/sharedProjects/{shareToken}` documents
- owners to create, update, and delete their own shared token documents

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
- `.kicad_sch` files can import components, but not full schematic connectivity yet

Current limitation:

- Native `.kicad_sch` schematic parsing is not implemented yet

## Current Limitations

- Full `.kicad_sch` net connectivity extraction is still not implemented
- Shared project links are read-only
- Large production bundles still trigger Vite chunk-size warnings
