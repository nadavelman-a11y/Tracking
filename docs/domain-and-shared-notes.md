# Domain and shared notes setup

The requested address is **tracking.ninaelmaninteriors.com**. Shared shipment details use the tracking number as the lookup key, with no employee sign-in, as requested. Anyone with that number can view and edit its shared notes. Records cannot be listed through the notes API.

## Current status

The GitHub Pages site is already live at https://nadavelman-a11y.github.io/Tracking/. The shared storage service and frontend connection are implemented and tested against a real local Cloudflare Workers runtime, including separate browsers, automatic refresh, and conflicting edits. Online shared storage is **not connected** until the Cloudflare deployment and frontend repository variable below are completed. Browser-only notes continue working in the meantime.

DNS checks found Wix nameservers (`ns6.wixdns.net` and `ns7.wixdns.net`) for Nina’s existing domain, and no record for the requested `tracking` host. The domain owner or their Wix administrator must add that record; a separate domain purchase is not needed. Do not change the main website’s records or transfer its nameservers.

## Preserve existing browser notes

On the current site, expand **Keep your saved notes** and select **Download backup**. Keep that JSON file before activating a new domain. Browser storage belongs to a web address, so the new domain cannot directly read the old address’s local notes. After opening the new domain, use **Restore backup** when needed. Existing nonempty local details are preserved on restore. Restoring a file does not overwrite online shared notes. For a shipment with no online record, existing browser details can be shared by opening it and selecting **Save details**.

## Deploy the shared storage service

1. Create a free Cloudflare account. This implementation uses a Workers service with SQLite-backed Durable Objects, supported on Workers Free. No paid plan upgrade is required for the intended setup; if free quotas are exhausted, requests fail rather than silently upgrading the plan.
2. At https://dash.cloudflare.com/profile/api-tokens create an **Edit Cloudflare Workers** API token scoped to the intended account. Enter it securely as `CLOUDFLARE_API_TOKEN` in the cloud environment settings and save. Never paste it into chat, commit it, or put it in a `VITE_` variable. The saved secret requirement sends it only to `api.cloudflare.com`.
3. Inspect account access through the supported proxy with the existing binding. Determine the account ID from the account metadata or dashboard; if needed, set the non-secret `CLOUDFLARE_ACCOUNT_ID` for Wrangler. Confirm the account has its `workers.dev` subdomain configured.
4. From `/workspace/Tracking`, run:

   ```sh
   npm ci --cache /tmp/tracking-npm-cache
   npm run notes:deploy
   ```

   This deploys `worker/wrangler.jsonc`; its migration creates the storage namespace automatically, so no separate database ID is needed. Keep the default free account plan. The token is for deployment, not a browser credential.
5. Verify the returned HTTPS endpoint’s `/health` and an unused synthetic tracking number at `/api/shipments/<number>`. Test a save and read it from another browser before enabling the frontend. Do not query or populate real shipment records merely to test deployment.
6. Set `sharedNotesEndpoint` in `src/site-config.js` to the exact verified Worker URL, without a trailing slash, then commit and push. This URL is public configuration, not a secret. Alternatively, a repository administrator can set the GitHub Actions variable `SHARED_NOTES_URL`; the workflow injects it as `VITE_SHARED_NOTES_URL` during the build, overriding the file. The current GitHub integration returned 403 for the Actions variables API, so using the public configuration file avoids a separate admin-console step.
7. Dispatch **Publish tracking website**, wait for its success, and verify that separate browser sessions see the same saved notes for a synthetic number. The app refreshes active, visible records every 10 seconds and on return to the page. Version checks preserve drafts when two people edit the same shipment.

No Cloudflare deployment has been verified until these steps are executed with a usable account binding. A locally passing test does not establish online syncing.

## Connect the requested domain

Have the owner of `ninaelmaninteriors.com` add this record in Wix DNS:

| Type | Host / name | Points to / value |
| --- | --- | --- |
| CNAME | `tracking` | `nadavelman-a11y.github.io` |

The target is a hostname only: do not include `https://` or `/Tracking/`. Use the normal DNS TTL. If a conflicting `tracking` record appears before this change, investigate it instead of overwriting it.

Before activating the custom domain, make sure the user has downloaded their current browser notes or shared them online. Verify DNS resolves to the intended GitHub Pages hostname. Then set the GitHub Pages custom domain to `tracking.ninaelmaninteriors.com` and retain it in `public/CNAME` so future builds preserve it. **Do not add `public/CNAME` or change the live Pages domain while DNS or note migration is pending.**

Wait for GitHub’s HTTPS certificate to finish provisioning, enable HTTPS enforcement when available, and check the page and assets at the actual custom address. Verify cross-browser notes there too. The Worker already allows both the GitHub Pages origin and the requested custom origin.

## Local development and checks

```sh
# Terminal 1: actual local Workers runtime, persistent data under ignored .wrangler paths
npm run notes:dev

# Terminal 2: frontend connected to the local notes service
VITE_SHARED_NOTES_URL=http://127.0.0.1:8787 npm run dev -- --port 5174

# Browser-only workflow plus real local shared-service integration checks
npm test
```

Cloud environments can set `WRANGLER_SEND_METRICS=false`, `WRANGLER_LOG_PATH=/tmp/nina-wrangler.log`, and `XDG_CONFIG_HOME=/tmp/nina-wrangler-config` to keep local tool files in writable paths. Preserve HTTPS verification for external requests.

The Worker exposes only `GET`/`PUT /api/shipments/:number`, an OPTIONS handler, and `/health`. There is no sign-in, public directory of shipments, or delete-all route. It validates the allowed text fields and their lengths, normalizes tracking numbers, and commits saves with a version comparison in a storage transaction. CORS is a browser-origin check, not staff authentication.
