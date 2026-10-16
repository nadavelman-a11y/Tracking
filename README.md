# Nina Elman Interiors · Studio shipment desk

A responsive shipment workspace for Nina Elman Interiors employees, with the studio’s official logo, gold and charcoal accents, project photography, and locally hosted typography. Staff can attach project references, suppliers, items, purchase orders, and notes to each shipment. The configured online service synchronizes details by tracking number without employee sign-in; anyone with that number can view and edit shared notes. Browser-only mode is also available for isolated development and backups. The website itself remains public. Brand assets were sourced from the user-provided https://www.ninaelmaninteriors.com/.

## Run locally

Requires Node.js 22.12+ and npm. The cloud environment uses Node.js 24, including for the local shared-storage runtime.

```sh
cd /workspace/Tracking
npm ci --cache /tmp/tracking-npm-cache
npm run dev -- --port 5173 --strictPort
```

For a production build, run `npm run build`. The `dist/` directory can be hosted by a static website host. `npm run preview` serves the production output locally; it is not a production hosting service. Asset paths are relative so the site also works under GitHub Pages’ `/Tracking/` path.

The GitHub Pages workflow in `.github/workflows/deploy.yml` builds and publishes pushes to `main` once Pages is enabled with GitHub Actions as its source. Deployment progress and errors appear in the repository’s Actions tab.

The public website is live at **https://nadavelman-a11y.github.io/Tracking/**. GitHub Pages is enabled with **GitHub Actions** as its source. Deployment run `38824784967` succeeded, and the public HTML, JavaScript, CSS, logo, photography, and font files were verified to return HTTP 200 over TLS. Future pushes to `main` publish automatically through the workflow; verify the latest run before claiming an update is live.

## Domain and shared notes

The requested custom address is `tracking.ninaelmaninteriors.com`. Its Wix DNS record is still an external prerequisite. The Cloudflare account connection is working, and the shared service is deployed at `https://nina-elman-shipment-notes.nina-elman-studio-82bc2b.workers.dev`. An anonymous save and read from a separate client passed against that HTTPS endpoint, with synthetic test contents cleared afterward. See [the setup guide](docs/domain-and-shared-notes.md) for the exact CNAME record, deployment steps, and existing-note migration. Do not activate the custom domain until DNS and note migration are ready.

The Cloudflare Worker in `worker/` stores shared details under each tracking number with no sign-in. It supports automatic 10-second refresh, preserves editing drafts, and rejects conflicting saves instead of overwriting a newer version. The frontend uses the verified public endpoint in `src/site-config.js`, optionally overridden by `VITE_SHARED_NOTES_URL`. An explicitly empty override selects browser-only mode for tests; an unset override uses the checked-in service. GitHub Actions builds with that checked-in public URL. No Cloudflare deployment credential belongs in the frontend or repository.

The verified online endpoint is configured in `src/site-config.js`. Once this frontend version is deployed, saving notes shares them by tracking number and other visible views refresh about every 10 seconds. Existing browser-only details are offered for sharing rather than silently discarded. No end-user sign-in is required: the user explicitly chose sharing by tracking number alone.

## Saved client folders

**Saved no.s** opens the shared client directory. Add a client folder, then save tracking numbers with item descriptions. Folders sort alphabetically; search finds client names, numbers, and descriptions. Select a shipment to track it, edit its description, or remove its listing without deleting shipment notes. The same number can be saved in multiple client folders. Saving it again within one folder updates the description. Empty folders are supported. The directory refreshes every 10 seconds while open, with no sign-in. Existing notes remain separate: add their numbers to a folder to include them in the directory.

`src/saved-shipments.js` uses `/api/saved` on the existing Worker. Migration `v2` adds the `SavedShipments` Durable Object alongside the existing notes storage; preserve migration `v1` when deploying. Each entry has its own storage key so hundreds of numbers do not share a single limited-size value. Browser-only previews cannot synchronize folders.

## Open without hosting

Download `downloads/nina-elman-tracking.html` and open it in a browser. All layout assets, fonts, photographs, and code are included in that single file. Internet access is still needed for live 17TRACK tracking. Rebuild this downloadable version with `npm run build:download` after changing the website.

## Tracking integration

The form uses 17TRACK’s external-call widget at `https://www.17track.net/externalcall.js`, which creates a tracking iframe on `https://extcall.17track.net`. Its supported `YQ_RmHeader: true` and `YQ_RmAD: true` display options remove the provider’s banner and advertising. The official `api-track.min.js` and `yqad.min.js` scripts were inspected to verify these options. Attribution and an external tracking link remain visible. The iframe’s surrounding card is restyled, with a project-details sidebar. No API credentials are required; the user does not currently have confirmed API access. The underlying carrier timeline remains controlled by 17TRACK, so a fully custom live timeline would need a supported API and backend.

The site validates and normalizes numbers, supports up to 10 shipments, remembers the eight most recent searches in local browser storage, and provides a direct `https://t.17track.net/en#nums=…` link. The widget is requested only after a tracking submission. If the script is unavailable, the external link and retry control remain available. Recent searches can be cleared without deleting saved project details. Unsaved project-detail drafts survive switching between shipments in the current page. “Save details” persists them in the configured shared service, or in browser storage when sharing is not connected. Failures are reported rather than claiming a successful save. The **Keep your saved notes** panel exports local data and restores backups without replacing existing nonempty details.

The sample delivery is explicitly fictional. Its styled timeline shows a potential design for a future custom integration; it is not a live shipment or an API-backed result. Showing live updates in that custom timeline would require a supported tracking API and a backend to protect its credentials.

### Current external checks

The official widget script was downloaded over verified TLS, and executing that script was verified to create an iframe on the expected host containing the correct tracking number. The brand website and the widget iframe endpoint both return HTTP 200 after network access was enabled. Headless Chromium in the cloud lacks trust for the cloud proxy’s certificate; verification has not been disabled to work around that. An actual shipment’s carrier events have not been verified.

## Tests

```sh
npm test
```

The 15 browser-only tests cover tracking interactions, supported banner/advertising display flags, mobile layouts, local project details, storage failures, backup export/restore, and backup validation. Eleven additional integration checks run against the real local Cloudflare Workers storage runtime and cover separate browser sessions, automatic refresh, conflicting edits, retained drafts, record isolation, validation, storage transactions, and migrating existing local notes. Tests use synthetic numbers; the 17TRACK widget is stubbed so they do not query real shipments or establish live carrier behavior. System Chromium is used where available, or `CHROMIUM_PATH` if specified. On other machines, install Playwright’s browser with `npx playwright install chromium`.

## Structure

- `src/main.js`: page, tracking integration, history, and sample experience
- `src/style.css`: responsive styles
- `src/shared-notes.js` and `src/detail-sync.js`: shared service connection and draft-aware refresh
- `src/workspace-backup.js`: validated, non-destructive local note backups
- `worker/`: deployable shared notes service and automatic storage migration
- `docs/domain-and-shared-notes.md`: activation and custom-domain instructions
- `public/nina-elman-logo.png`: official logo, from the brand website’s header
- `public/nina-elman-interior.jpg`: project photography, from the brand website
- `tests/tracking.spec.js`: browser checks

Use the existing checkout in this isolated cloud task. No Git worktree is needed.
