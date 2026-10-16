import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import './style.css';
import { createBackup, readBackup, mergeBackup } from './workspace-backup.js';
import { sharedNotesEnabled } from './shared-notes.js';
import { mountSavedShipments } from './saved-shipments.js';
import { connectSharedDetails } from './detail-sync.js';

const paths = {
  arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
  box: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  check: '<path d="m6 12 4 4 8-8"/>',
  leaf: '<path d="M19 4C9 2 3 7 6 14c5 5 13 2 13-10ZM4 21 15 9"/>',
  truck: '<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7M14 13h7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M10 4H4v16h16v-6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const assetPath = name => window.__NINA_INLINE_ASSETS__?.[name] || `${import.meta.env.BASE_URL}${name}`;
const brand = `<img class="brand-logo" src="${assetPath('nina-elman-logo.png')}" alt="Nina Elman Interiors" width="630" height="454">`;

document.querySelector('#app').innerHTML = `
  <a class="skip-link" href="#tracking-number">Skip to shipment tracking</a>
  <header class="header shell">
    <a class="brand" href="#" aria-label="Nina Elman Interiors home">${brand}</a>
    <nav aria-label="Main navigation">
      <a class="nav-active" href="#track">Shipment desk</a>
      <button class="text-button" id="open-saved" type="button">Saved numbers</button>
      <a href="#how-it-works">Quick guide</a>
      <a class="nav-help" href="#questions">Need a hand? ${icon('arrow')}</a>
    </nav>
  </header>

  <main>
    <section class="hero shell" aria-labelledby="hero-title">
      <div class="hero-copy">
        <div class="eyebrow"><span class="small-line"></span> THE STUDIO DELIVERY DESK</div>
        <h1 id="hero-title">Every piece.<br>Every <em>project.</em></h1>
        <p class="hero-description">A working space for the Nina Elman Interiors team.<br class="desktop-break"> Follow supplier shipments and keep project details together.</p>

        <div class="tracking-card" id="track">
          <div class="card-heading"><span class="box-mark">${icon('box')}</span><div><h2>Find a shipment</h2><p>Supplier deliveries, all in one place.</p></div></div>
          <form id="tracking-form" novalidate>
            <div class="field-heading"><label for="tracking-number">TRACKING NUMBER</label><button class="text-button mode-button" id="toggle-multiple" type="button" aria-pressed="false">Track multiple</button></div>
            <div class="input-wrap">${icon('search')}<textarea id="tracking-number" rows="1" name="tracking-number" placeholder="Enter your tracking number" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="tracking-hint tracking-error" required maxlength="800"></textarea><button type="button" class="clear-input" id="clear-input" aria-label="Clear tracking number" hidden>${icon('close')}</button></div>
            <p class="input-hint" id="tracking-hint">Use the number from the supplier’s shipping confirmation.</p>
            <p class="form-error" id="tracking-error" role="alert" hidden></p>
            <button class="primary-button" type="submit"><span>Track shipment</span>${icon('arrow')}</button>
          </form>
          <div class="tracking-provider"><span class="status-dot"></span> Carrier tracking <span class="provider-divider">·</span> Powered by <a href="https://www.17track.net/en" target="_blank" rel="noopener noreferrer">17TRACK ${icon('external')}</a></div>
        </div>
        <div class="demo-invite">New to the workspace? <button class="text-button" id="show-demo">See an example shipment ${icon('arrow')}</button></div>
      </div>
      <div class="hero-art">
        <img src="${assetPath('nina-elman-interior.jpg')}" alt="A Nina Elman Interiors project featuring a sculptural chandelier and a sunlit bay window" width="859" height="1300" fetchpriority="high">
        <div class="art-corner">NINA ELMAN INTERIORS<br>STUDIO OPERATIONS</div>
        <div class="art-note"><span class="note-icon">${icon('leaf')}</span><span>Details, together.<small>From supplier to installation.</small></span></div>
        <span class="art-caption">THE STUDIO WORKSPACE</span>
      </div>
    </section>

    <section class="recent-section shell" id="recent-section" aria-labelledby="recent-title" hidden>
      <div class="section-line"><h2 id="recent-title">Recent shipments <span>Searches on this browser</span></h2><button class="text-button" id="clear-recent">Clear recent searches</button></div>
      <p class="workspace-storage-note">${sharedNotesEnabled ? 'Shared by tracking number. Anyone with the number can view and edit the project details.' : 'Project details and notes stay on this browser. Shared storage is not connected yet.'}</p><div id="recent-list" class="recent-list"></div>
    </section>

    <section class="workspace-tools shell" aria-label="Workspace backup">
      <details><summary><span>${icon('box')} Keep your saved notes</span>${icon('chevron')}</summary><div class="backup-content"><p>Download a backup before moving to a new domain or browser. It includes your saved project details and notes. Restoring a backup keeps existing nonempty details.</p><div class="backup-actions"><button class="outline-button" id="export-workspace" type="button">Download backup ${icon('arrow')}</button><button class="outline-button" id="import-workspace" type="button">Restore backup</button><input id="backup-file" type="file" accept=".json,application/json" hidden></div><p id="backup-status" role="status"></p></div></details>
    </section>

    <section class="results-section shell" id="results" aria-labelledby="results-title" hidden>
      <div class="results-heading"><div><div class="eyebrow" id="result-eyebrow">SHIPMENT WORKSPACE</div><h2 id="results-title" tabindex="-1">Shipment overview.</h2></div><button class="text-button close-results" id="close-results">Close ${icon('close')}</button></div>
      <div id="results-content"></div>
    </section>

    <section class="benefits shell" id="how-it-works" aria-labelledby="benefits-title">
      <div class="benefits-intro"><div class="eyebrow">BUILT FOR THE STUDIO TEAM</div><h2 id="benefits-title">A more organized <em>delivery day.</em></h2></div>
      <div class="benefit-grid">
        <article><span class="benefit-number">01</span><div class="benefit-icon">${icon('search')}</div><h3>Track the supplier’s shipment.</h3><p>Enter a tracking number from the supplier. Search up to 10 shipments at a time and switch between their updates.</p></article>
        <article><span class="benefit-number">02</span><div class="benefit-icon">${icon('globe')}</div><h3>Keep the project attached.</h3><p>Add a project reference, supplier, item, order number, and notes to each shipment. ${sharedNotesEnabled ? 'Everyone viewing the same tracking number sees saved updates automatically.' : 'Details are saved on this browser until shared storage is connected.'}</p></article>
        <article><span class="benefit-number">03</span><div class="benefit-icon">${icon('leaf')}</div><h3>Plan the next handoff.</h3><p>Check carrier progress before coordinating receiving, delivery appointments, and installation with the team.</p></article>
      </div>
    </section>

    <section class="questions shell" id="questions" aria-labelledby="questions-title">
      <div class="questions-intro"><div class="eyebrow">WORKSPACE HELP</div><h2 id="questions-title">A few things<br>for the <em>team.</em></h2><p>A quick reference for tracking<br>supplier and project deliveries.</p></div>
      <div class="faq-list">
        <details><summary>Where can I find my tracking number? ${icon('chevron')}</summary><p>Use the tracking number in the supplier’s dispatch email or shipping confirmation. Supplier order numbers and purchase order references are separate; you can save those in the shipment’s project details.</p></details>
        <details><summary>Why isn’t my tracking showing updates? ${icon('chevron')}</summary><p>A new number can take 24–48 hours to appear after a carrier receives your shipment. Updates may also pause between scans or during customs processing. If the expected delivery date has passed, contact the retailer or carrier with your tracking number.</p></details>
        <details><summary>What if my order arrives in several deliveries? ${icon('chevron')}</summary><p>Furniture and accessories may ship in separate cartons or from different suppliers. Each shipment has its own tracking number. Choose “Track multiple” to enter up to 10 numbers, one per line, and switch between their results.</p></details>
        <details><summary>Can the rest of the team see my notes? ${icon('chevron')}</summary><p>${sharedNotesEnabled ? 'Yes. Saved details are shared with anyone who enters the same tracking number, with no sign-in. Other open views refresh automatically about every 10 seconds. If someone changes a shipment while you are editing, your draft is kept and you can load the latest shared version before saving.' : 'Shared storage is not connected yet. Your saved details stay on this browser. Once connected, anyone entering the same tracking number will be able to view and edit shared notes without signing in.'} For delivery changes and appointments, contact the supplier or carrier directly.</p></details>
        <details><summary>How is my tracking information used? ${icon('chevron')}</summary><p>Submitting a number sends it to 17TRACK to look up carrier information. Recent numbers stay in this browser only and can be cleared above. Saved client folders, tracking numbers, descriptions, and notes are shared with everyone using this workspace, without sign-in. 17TRACK’s own privacy policy applies to its tracking service.</p></details>
      </div>
    </section>

    <section class="closing-strip"><div class="shell"><span class="mini-flower" aria-hidden="true">✳</span><p>Every shipment has a project.<br class="mobile-break"> <em>Keep the details together.</em></p><a href="#track" aria-label="Back to shipment tracking">${icon('arrow')}</a></div></section>
  </main>
  <footer class="footer shell"><a class="brand" href="#" aria-label="Nina Elman Interiors home">${brand}</a><p>Nina Elman Interiors · Studio operations.</p><span>© ${new Date().getFullYear()} NINA ELMAN INTERIORS</span></footer>
`;

const form = document.querySelector('#tracking-form');
const input = document.querySelector('#tracking-number');
const error = document.querySelector('#tracking-error');
const results = document.querySelector('#results');
const content = document.querySelector('#results-content');
const storageKey = 'nina-elman-tracking-history';
const detailStorageKey = 'nina-elman-shipment-details';
const detailDrafts = new Map();
const draftVersions = new Map();
const sharedDetails = new Map();
let stopDetailSync = () => {};
let multiple = false;
let requestId = 0;
let widgetPromise;
let directory;
let savedContext = null;

function shipmentDetails(number) {
  if (sharedNotesEnabled && sharedDetails.get(number)?.version > 0) return sharedDetails.get(number).details;
  try {
    const entries = JSON.parse(localStorage.getItem(detailStorageKey) || '{}');
    const data = entries && typeof entries === 'object' && Object.hasOwn(entries, number) ? entries[number] : {};
    return Object.fromEntries(['project', 'supplier', 'item', 'order', 'notes'].map(key => [key, typeof data?.[key] === 'string' ? data[key].slice(0, key === 'notes' ? 2000 : 200) : '']));
  } catch { return {}; }
}

function mountLocalDetails(number, panel) {
  const details = detailDrafts.get(number) || shipmentDetails(number);
  const form = panel.querySelector('#shipment-details-form');
  for (const [key, value] of Object.entries(details)) form.elements.namedItem(key).value = value;
  if (detailDrafts.has(number)) {
    panel.querySelector('#details-status').textContent = 'Unsaved changes. Select “Save details” to keep them.';
    panel.querySelector('#details-status').dataset.state = 'unsaved';
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    const status = panel.querySelector('#details-status');
    try {
      const stored = JSON.parse(localStorage.getItem(detailStorageKey) || '{}');
      const entries = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
      entries[number] = Object.fromEntries(new FormData(form));
      localStorage.setItem(detailStorageKey, JSON.stringify(entries));
      detailDrafts.delete(number);
      status.textContent = 'Details saved on this browser.';
      status.dataset.state = 'saved';
      renderHistory();
    } catch {
      status.textContent = 'Your browser could not save these details. Keep this page open and copy any notes you need.';
      status.dataset.state = 'error';
    }
  });
  form.addEventListener('input', () => {
    detailDrafts.set(number, Object.fromEntries(new FormData(form)));
    panel.querySelector('#details-status').textContent = 'Unsaved changes. Select “Save details” to keep them.';
    panel.querySelector('#details-status').dataset.state = 'unsaved';
  });
}

function mountDetails(number, panel) {
  if (!sharedNotesEnabled) { mountLocalDetails(number, panel); return; }
  stopDetailSync = connectSharedDetails({
    number,
    form: panel.querySelector('#shipment-details-form'),
    status: panel.querySelector('#details-status'),
    loadLatest: panel.querySelector('#load-shared-version'),
    localDetails: shipmentDetails(number),
    drafts: detailDrafts,
    versions: draftVersions,
    cached: sharedDetails.get(number),
    decorateDetails: details => {
      const context = savedContext?.number === number ? directory?.getContext(savedContext.folderId, number) : null;
      return context ? { ...details, project: context.client, item: context.description, supplier: context.supplier || '' } : details;
    },
    onRecord: record => { sharedDetails.set(number, record); renderHistory(); },
    persist: details => {
      const stored = JSON.parse(localStorage.getItem(detailStorageKey) || '{}');
      const entries = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
      entries[number] = details;
      localStorage.setItem(detailStorageKey, JSON.stringify(entries));
    },
  });
}

function getHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(value) ? value.filter(n => typeof n === 'string' && /^[a-zA-Z0-9-]{5,50}$/.test(n)).slice(0, 8) : [];
  } catch { return []; }
}

function renderHistory() {
  const numbers = getHistory();
  document.querySelector('#recent-section').hidden = !numbers.length;
  const list = document.querySelector('#recent-list');
  list.replaceChildren();
  for (const number of numbers) {
    const button = document.createElement('button');
    button.className = 'recent-chip';
    button.innerHTML = `${icon('clock')}<span></span>${icon('arrow')}`;
    button.querySelector('span').textContent = number;
    const details = shipmentDetails(number);
    if (details.project || details.item) {
      const label = document.createElement('small');
      label.textContent = details.project || details.item;
      button.querySelector('span').prepend(label);
    }
    button.addEventListener('click', () => { input.value = number; updateInput(); track([number]); });
    list.append(button);
  }
}

function saveHistory(numbers) {
  try { localStorage.setItem(storageKey, JSON.stringify([...new Set([...numbers, ...getHistory()])].slice(0, 8))); } catch { /* Tracking works when browser storage is unavailable. */ }
  renderHistory();
}

function updateInput() {
  document.querySelector('#clear-input').hidden = !input.value;
  input.removeAttribute('aria-invalid');
  error.hidden = true;
}

function setError(message) {
  error.textContent = message;
  error.hidden = false;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

function revealResults(demo = false) {
  results.hidden = false;
  document.querySelector('#result-eyebrow').textContent = demo ? 'SAMPLE DELIVERY · ILLUSTRATIVE PREVIEW' : 'SHIPMENT WORKSPACE';
  document.querySelector('#results-title').textContent = demo ? 'An example project shipment.' : 'Shipment overview.';
  results.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  document.querySelector('#results-title').focus({ preventScroll: true });
}

function loadWidget() {
  if (window.YQV5?.trackSingle) return Promise.resolve(window.YQV5);
  if (widgetPromise) return widgetPromise;
  widgetPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.17track.net/externalcall.js';
    script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    const failed = () => {
      clearTimeout(timer);
      script.remove();
      widgetPromise = undefined;
      reject(new Error('The 17TRACK tracker is unavailable.'));
    };
    const timer = setTimeout(failed, 10000);
    script.onload = () => {
      clearTimeout(timer);
      if (window.YQV5?.trackSingle) resolve(window.YQV5);
      else failed();
    };
    script.onerror = failed;
    document.head.append(script);
  });
  return widgetPromise;
}

function trackingLink(number) { return `https://t.17track.net/en#nums=${encodeURIComponent(number)}`; }

async function showLiveNumber(number) {
  stopDetailSync();
  const currentRequest = ++requestId;
  const panel = document.querySelector('#live-panel');
  panel.innerHTML = `<button type="button" class="text-button back-client" data-back-client>← Back to saved numbers</button><p class="saved-shipment-context" id="saved-shipment-context" hidden></p><div class="live-topline"><div><span class="eyebrow">SHIPMENT REFERENCE</span><h3 id="active-number"></h3></div><button type="button" class="outline-button" data-save-number="${number}">Save in client folder</button><a id="carrier-link" class="outline-button" target="_blank" rel="noopener noreferrer">Open in 17TRACK ${icon('external')}</a></div>
    <div class="shipment-workspace"><aside class="shipment-details" aria-labelledby="details-heading"><div class="details-title">${icon('box')}<h3 id="details-heading">Project details</h3></div><p class="details-intro">Keep the context with the shipment.</p>
      <form id="shipment-details-form">
        <label for="detail-project">Project / client reference</label><input id="detail-project" name="project" maxlength="120" placeholder="e.g. Oak House" autocomplete="off">
        <label for="detail-supplier">Supplier</label><input id="detail-supplier" name="supplier" maxlength="120" placeholder="Supplier name" autocomplete="off">
        <label for="detail-item">Item / room</label><input id="detail-item" name="item" maxlength="200" placeholder="e.g. Lounge chair · living room" autocomplete="off">
        <label for="detail-order">PO / order number</label><input id="detail-order" name="order" maxlength="120" placeholder="Purchase order reference" autocomplete="off">
        <label for="detail-notes">Team notes</label><textarea id="detail-notes" name="notes" rows="3" maxlength="2000" placeholder="Receiving instructions, installation notes…"></textarea>
        <button class="save-details" type="submit">Save details ${icon('check')}</button>
        <p id="details-status" class="details-status" role="status">${sharedNotesEnabled ? 'Loading shared notes…' : 'Saved on this browser only. Shared storage is not connected yet.'}</p>
        <button class="text-button load-shared-version" id="load-shared-version" type="button" hidden>Load shared version</button>
      </form></aside>
      <div class="carrier-panel"><div class="widget-notice" role="status"><span class="loading-spinner" aria-hidden="true"></span><div><strong>Retrieving carrier updates</strong><p>Connecting to 17TRACK…</p></div></div><div id="tracking-widget"></div><div class="provider-footnote">${icon('globe')} Carrier data by 17TRACK. Delivery estimates may change.</div></div>
    </div>`;
  document.querySelector('#active-number').textContent = number;
  document.querySelector('#carrier-link').href = trackingLink(number);
  const context = savedContext?.number === number ? directory?.getContext(savedContext.folderId, number) : null;
  if (context) {
    const label = panel.querySelector('#saved-shipment-context'); label.hidden = false; label.textContent = `${context.client} · ${context.description}`;
    for (const field of ['project', 'item', 'supplier']) panel.querySelector(`[name="${field}"]`).readOnly = true;
    panel.querySelector('.details-intro').textContent = 'Client, item, and supplier come from the saved shipment. Use Back to saved numbers, then Edit to change them.';
  }
  mountDetails(number, panel);
  try {
    const widget = await loadWidget();
    if (currentRequest !== requestId) return;
    widget.trackSingle({ YQ_ContainerId: 'tracking-widget', YQ_Height: 700, YQ_Fc: '0', YQ_Lang: 'en', YQ_Num: number, YQ_RmHeader: true, YQ_RmAD: true });
    const frame = document.querySelector('#tracking-widget iframe');
    if (frame) {
      frame.title = `17TRACK shipment details for ${number}`;
      frame.style.border = '0';
      frame.style.boxShadow = 'none';
      frame.style.borderRadius = '4px';
      frame.style.minWidth = '0';
    }
    panel.querySelector('.widget-notice').innerHTML = `<span>${icon('truck')} Carrier updates</span><span class="carrier-provider">Data by 17TRACK</span>`;
    panel.querySelector('.widget-notice').classList.add('widget-connected');
  } catch {
    if (currentRequest !== requestId) return;
    const notice = panel.querySelector('.widget-notice');
    notice.classList.add('widget-unavailable');
    notice.innerHTML = `<span class="fallback-icon">${icon('box')}</span><div><strong>Your tracking link is ready.</strong><p>The embedded tracker couldn’t connect. Open your number directly in 17TRACK to check for updates.</p><button class="text-button retry-widget" type="button">Try connecting again ${icon('arrow')}</button></div>`;
    notice.querySelector('button').addEventListener('click', () => showLiveNumber(number));
  }
}

function track(numbers, context = null) {
  savedContext = context || directory?.contextFor(numbers[0]) || null;
  saveHistory(numbers);
  content.innerHTML = '<div class="number-tabs" role="group" aria-label="Choose shipment" hidden></div><div class="live-panel" id="live-panel"></div>';
  const tabs = content.querySelector('.number-tabs');
  if (numbers.length > 1) {
    tabs.hidden = false;
    for (const number of numbers) {
      const button = document.createElement('button');
      button.textContent = number;
      button.setAttribute('aria-pressed', String(number === numbers[0]));
      button.addEventListener('click', () => {
        tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        showLiveNumber(number);
      });
      tabs.append(button);
    }
  }
  revealResults();
  showLiveNumber(numbers[0]);
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const raw = input.value.trim();
  if (!raw) { setError('Please enter the tracking number from the supplier’s shipping email.'); return; }
  if (!multiple && /[\r\n,;]/.test(raw)) { setError('For several tracking numbers, select “Track multiple” and put one on each line.'); return; }
  const entries = multiple ? raw.split(/[\n,;]+/).map(n => n.trim()).filter(Boolean) : [raw];
  const numbers = [...new Set(entries.map(n => n.replace(/\s+/g, '').toUpperCase()))];
  if (numbers.length > 10) { setError('Please enter up to 10 tracking numbers at a time.'); return; }
  if (numbers.some(n => !/^[A-Z0-9-]{5,50}$/.test(n))) {
    setError('Use a tracking number with 5–50 letters, numbers, or hyphens. For several numbers, select “Track multiple” and put one on each line.');
    return;
  }
  input.removeAttribute('aria-invalid');
  error.hidden = true;
  track(numbers);
});

input.addEventListener('input', updateInput);
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !multiple) { event.preventDefault(); form.requestSubmit(); }
});
document.querySelector('#clear-input').addEventListener('click', () => { input.value = ''; updateInput(); input.focus(); });
document.querySelector('#toggle-multiple').addEventListener('click', event => {
  multiple = !multiple;
  event.currentTarget.setAttribute('aria-pressed', String(multiple));
  event.currentTarget.textContent = multiple ? 'Track one shipment' : 'Track multiple';
  input.rows = multiple ? 3 : 1;
  input.placeholder = multiple ? 'One tracking number per line' : 'Enter your tracking number';
  document.querySelector('#tracking-hint').textContent = multiple ? 'Up to 10 tracking numbers, one per line.' : 'Use the number from the supplier’s shipping confirmation.';
  input.focus();
});
document.querySelector('#clear-recent').addEventListener('click', () => {
  try { localStorage.removeItem(storageKey); } catch { /* Browser storage may be disabled. */ }
  renderHistory();
});
document.querySelector('#close-results').addEventListener('click', () => {
  stopDetailSync();
  ++requestId;
  results.hidden = true;
  content.replaceChildren();
  input.focus();
});

document.querySelector('#show-demo').addEventListener('click', () => {
  stopDetailSync();
  ++requestId;
  content.innerHTML = `<div class="demo-banner">This is a design preview with example information, not a live shipment.</div>
    <div class="demo-layout"><div class="demo-summary"><div class="demo-status">${icon('truck')} In transit</div><h3>Lounge chair<br>for the Oak House project.</h3><p>Example supplier · Example purchase order</p><div class="demo-estimate"><span class="eyebrow">EXAMPLE DELIVERY WINDOW</span><strong>Thursday, 12 June</strong><span>Delivery timing is illustrative.</span></div><div class="demo-meta"><span>Shipment reference</span><strong>NE–PREVIEW–001</strong><span>Delivery service</span><strong>Example carrier</strong></div></div>
    <div class="demo-timeline"><div class="timeline-heading"><h4>The journey so far</h4><span>EXAMPLE UPDATES</span></div>
      <ol><li class="current"><span class="timeline-marker">${icon('truck')}</span><div><span class="timeline-time">11 JUN · 09:42</span><h5>In transit to your local depot</h5><p>Your piece is on the next leg of its journey.</p></div></li><li><span class="timeline-marker">${icon('check')}</span><div><span class="timeline-time">10 JUN · 16:15</span><h5>Collected by the carrier</h5><p>Carefully packed and ready for the road.</p></div></li><li><span class="timeline-marker">${icon('check')}</span><div><span class="timeline-time">09 JUN · 11:30</span><h5>Delivery details received</h5><p>The first step toward your space.</p></div></li></ol>
      <p class="demo-disclaimer">This timeline is an example design, not live data. Actual shipments use the carrier view, with the provider’s header and advertising turned off.</p></div></div>`;
  revealResults(true);
});

document.querySelector('#export-workspace').addEventListener('click', () => {
  const status = document.querySelector('#backup-status');
  try {
    const shipments = JSON.parse(localStorage.getItem(detailStorageKey) || '{}');
    const blob = new Blob([createBackup(shipments, getHistory())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nina-elman-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Backup downloaded. Restore this file on your new domain or browser.';
  } catch {
    status.textContent = 'The backup could not be created. Your saved details have not been changed.';
  }
});

document.querySelector('#import-workspace').addEventListener('click', () => document.querySelector('#backup-file').click());
document.querySelector('#backup-file').addEventListener('change', async event => {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const status = document.querySelector('#backup-status');
  try {
    if (file.size > 1_000_000) throw new Error('Please choose a workspace backup smaller than 1 MB.');
    const incoming = readBackup(await file.text());
    const existing = JSON.parse(localStorage.getItem(detailStorageKey) || '{}');
    const shipments = mergeBackup(existing, incoming.shipments);
    localStorage.setItem(detailStorageKey, JSON.stringify(shipments));
    // History is only a shortcut; saved shipment details remain intact if it cannot be updated.
    let historySaved = true;
    try { localStorage.setItem(storageKey, JSON.stringify([...new Set([...getHistory(), ...incoming.recent, ...Object.keys(incoming.shipments)])].slice(0, 8))); } catch { historySaved = false; }
    renderHistory();
    status.textContent = historySaved ? (sharedNotesEnabled ? 'Backup restored to this browser. Shared notes were not changed. Open a shipment and save to share local details when no shared record exists.' : 'Backup restored. Existing nonempty details and unsaved drafts were kept.') : 'Shipment details restored. Your browser could not update recent searches.';
  } catch (error) {
    status.textContent = error.message || 'The backup could not be restored. Your saved details have not been changed.';
  } finally {
    input.value = '';
  }
});

renderHistory();

directory = mountSavedShipments({ openShipment: (number, context) => { input.value = number; updateInput(); track([number], context); } });

document.addEventListener('directory-updated', () => {
  if (!savedContext) return;
  const context = directory?.getContext(savedContext.folderId, savedContext.number);
  if (!context || document.querySelector('#active-number')?.textContent !== context.number) return;
  const label = document.querySelector('#saved-shipment-context');
  if (label) label.textContent = `${context.client} · ${context.description}`;
  const form = document.querySelector('#shipment-details-form');
  if (form) for (const [key,value] of Object.entries({project:context.client,item:context.description,supplier:context.supplier||''})) form.elements.namedItem(key).value=value;
});
