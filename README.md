# Nina Elman Interiors · Studio shipment desk

A responsive shipment workspace for Nina Elman Interiors employees, with the studio’s official logo, gold and charcoal accents, project photography, and locally hosted typography. Staff can attach project references, suppliers, items, purchase orders, and notes to each shipment. These records stay in browser storage; there is no employee login, shared database, or cross-device synchronization. The website itself remains public. Brand assets were sourced from the user-provided https://www.ninaelmaninteriors.com/.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm. The cloud environment has Node.js 24.

```sh
cd /workspace/Tracking
npm ci --cache /tmp/tracking-npm-cache
npm run dev -- --port 5173 --strictPort
```

For a production build, run `npm run build`. The `dist/` directory can be hosted by a static website host. `npm run preview` serves the production output locally; it is not a production hosting service. Asset paths are relative so the site also works under GitHub Pages’ `/Tracking/` path.

The GitHub Pages workflow in `.github/workflows/deploy.yml` builds and publishes pushes to `main` once Pages is enabled with GitHub Actions as its source. Deployment progress and errors appear in the repository’s Actions tab.

The public website is live at **https://nadavelman-a11y.github.io/Tracking/**. GitHub Pages is enabled with **GitHub Actions** as its source. Deployment run `38824784967` succeeded, and the public HTML, JavaScript, CSS, logo, photography, and font files were verified to return HTTP 200 over TLS. Future pushes to `main` publish automatically through the workflow; verify the latest run before claiming an update is live.

## Open without hosting

Download `downloads/nina-elman-tracking.html` and open it in a browser. All layout assets, fonts, photographs, and code are included in that single file. Internet access is still needed for live 17TRACK tracking. Rebuild this downloadable version with `npm run build:download` after changing the website.

## Tracking integration

The form uses 17TRACK’s external-call widget at `https://www.17track.net/externalcall.js`, which creates a tracking iframe on `https://extcall.17track.net`. Its supported `YQ_RmHeader: true` and `YQ_RmAD: true` display options remove the provider’s banner and advertising. The official `api-track.min.js` and `yqad.min.js` scripts were inspected to verify these options. Attribution and an external tracking link remain visible. The iframe’s surrounding card is restyled, with a project-details sidebar. No API credentials are required; the user does not currently have confirmed API access. The underlying carrier timeline remains controlled by 17TRACK, so a fully custom live timeline would need a supported API and backend.

The site validates and normalizes numbers, supports up to 10 shipments, remembers the eight most recent numbers in local browser storage, and provides a direct `https://t.17track.net/en#nums=…` link. The widget is requested only after a tracking submission. If the script is unavailable, the external link and retry control remain available. Recent searches can be cleared without deleting saved project details. Unsaved project-detail drafts survive switching between shipments in the current page; “Save details” persists them in browser storage. Storage failures are reported rather than claiming a successful save.

The sample delivery is explicitly fictional. Its styled timeline shows a potential design for a future custom integration; it is not a live shipment or an API-backed result. Showing live updates in that custom timeline would require a supported tracking API and a backend to protect its credentials.

### Current external checks

The official widget script was downloaded over verified TLS, and executing that script was verified to create an iframe on the expected host containing the correct tracking number. The brand website and the widget iframe endpoint both return HTTP 200 after network access was enabled. Headless Chromium in the cloud lacks trust for the cloud proxy’s certificate; verification has not been disabled to work around that. An actual shipment’s carrier events have not been verified.

## Tests

```sh
npm test
```

The 12 browser tests cover invalid input, normalized submissions, the supported banner/advertising display flags, widget failure/retry, multiple shipment selection, history persistence/clearing, the fictional sample, mobile layouts, project-detail persistence, per-shipment drafts, text-safe rendering, and storage failures. Tests use synthetic numbers and stub the remote widget for deterministic UI checks; they do not establish that a real shipment has carrier events or visually validate the vendor’s live page. They use system Chromium where available, or `CHROMIUM_PATH` if specified. On other machines, install Playwright’s browser with `npx playwright install chromium`.

## Structure

- `src/main.js`: page, tracking integration, history, and sample experience
- `src/style.css`: responsive styles
- `public/nina-elman-logo.png`: official logo, from the brand website’s header
- `public/nina-elman-interior.jpg`: project photography, from the brand website
- `tests/tracking.spec.js`: browser checks

Use the existing checkout in this isolated cloud task. No Git worktree is needed.
