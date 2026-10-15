import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import './style.css';

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
const assetPath = name => `${import.meta.env.BASE_URL}${name}`;
const brand = `<img class="brand-logo" src="${assetPath('nina-elman-logo.png')}" alt="Nina Elman Interiors" width="630" height="454">`;

document.querySelector('#app').innerHTML = `
  <a class="skip-link" href="#tracking-number">Skip to shipment tracking</a>
  <header class="header shell">
    <a class="brand" href="#" aria-label="Nina Elman Interiors home">${brand}</a>
    <nav aria-label="Main navigation">
      <a class="nav-active" href="#track">Track a delivery</a>
      <a href="#how-it-works">How it works</a>
      <a class="nav-help" href="#questions">Need a hand? ${icon('arrow')}</a>
    </nav>
  </header>

  <main>
    <section class="hero shell" aria-labelledby="hero-title">
      <div class="hero-copy">
        <div class="eyebrow"><span class="small-line"></span> THE DELIVERY CONCIERGE</div>
        <h1 id="hero-title">A little closer<br>to <em>home.</em></h1>
        <p class="hero-description">Beautiful spaces come together, piece by piece.<br class="desktop-break"> Follow the journey of your next finishing touch.</p>

        <div class="tracking-card" id="track">
          <div class="card-heading"><span class="box-mark">${icon('box')}</span><div><h2>Where is your delivery?</h2><p>Every detail, all the way to your door.</p></div></div>
          <form id="tracking-form" novalidate>
            <div class="field-heading"><label for="tracking-number">TRACKING NUMBER</label><button class="text-button mode-button" id="toggle-multiple" type="button" aria-pressed="false">Track multiple</button></div>
            <div class="input-wrap">${icon('search')}<textarea id="tracking-number" rows="1" name="tracking-number" placeholder="Enter your tracking number" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-describedby="tracking-hint tracking-error" required maxlength="800"></textarea><button type="button" class="clear-input" id="clear-input" aria-label="Clear tracking number" hidden>${icon('close')}</button></div>
            <p class="input-hint" id="tracking-hint">You’ll find this in your shipping confirmation email.</p>
            <p class="form-error" id="tracking-error" role="alert" hidden></p>
            <button class="primary-button" type="submit"><span>Track my delivery</span>${icon('arrow')}</button>
          </form>
          <div class="tracking-provider"><span class="status-dot"></span> Worldwide tracking <span class="provider-divider">·</span> Powered by <a href="https://www.17track.net/en" target="_blank" rel="noopener noreferrer">17TRACK ${icon('external')}</a></div>
        </div>
        <div class="demo-invite">Just taking a look? <button class="text-button" id="show-demo">Explore a sample delivery ${icon('arrow')}</button></div>
      </div>
      <div class="hero-art">
        <img src="${assetPath('nina-elman-interior.jpg')}" alt="A Nina Elman Interiors project featuring a sculptural chandelier and a sunlit bay window" width="859" height="1300" fetchpriority="high">
        <div class="art-corner">CONSIDERED SPACES.<br>THOUGHTFUL DETAILS.</div>
        <div class="art-note"><span class="note-icon">${icon('leaf')}</span><span>Worth the wait.<small>Made to feel like home.</small></span></div>
        <span class="art-caption">THE ART OF ARRIVING WELL</span>
      </div>
    </section>

    <section class="recent-section shell" id="recent-section" aria-labelledby="recent-title" hidden>
      <div class="section-line"><h2 id="recent-title">Recently tracked <span>On this device</span></h2><button class="text-button" id="clear-recent">Clear history</button></div>
      <div id="recent-list" class="recent-list"></div>
    </section>

    <section class="results-section shell" id="results" aria-labelledby="results-title" hidden>
      <div class="results-heading"><div><div class="eyebrow" id="result-eyebrow">YOUR DELIVERY</div><h2 id="results-title" tabindex="-1">The journey to your door.</h2></div><button class="text-button close-results" id="close-results">Close ${icon('close')}</button></div>
      <div id="results-content"></div>
    </section>

    <section class="benefits shell" id="how-it-works" aria-labelledby="benefits-title">
      <div class="benefits-intro"><div class="eyebrow">FROM OUR STUDIO TO YOUR SPACE</div><h2 id="benefits-title">The journey, <em>simplified.</em></h2></div>
      <div class="benefit-grid">
        <article><span class="benefit-number">01</span><div class="benefit-icon">${icon('search')}</div><h3>A number is all you need.</h3><p>Copy the tracking number from your shipping confirmation. We’ll take it from here.</p></article>
        <article><span class="benefit-number">02</span><div class="benefit-icon">${icon('globe')}</div><h3>Across carriers. Across borders.</h3><p>Follow your delivery’s progress with carrier updates, brought together by 17TRACK.</p></article>
        <article><span class="benefit-number">03</span><div class="benefit-icon">${icon('leaf')}</div><h3>A more considered arrival.</h3><p>See the latest available delivery details, so you can make room for what’s next.</p></article>
      </div>
    </section>

    <section class="questions shell" id="questions" aria-labelledby="questions-title">
      <div class="questions-intro"><div class="eyebrow">A LITTLE GUIDANCE</div><h2 id="questions-title">A few things<br>you might <em>wonder.</em></h2><p>Good things take care.<br>Here’s what to know along the way.</p></div>
      <div class="faq-list">
        <details><summary>Where can I find my tracking number? ${icon('chevron')}</summary><p>Your tracking number is in the shipping confirmation sent by your retailer or delivery provider. It may arrive separately from your order confirmation. An order number is usually different from a tracking number.</p></details>
        <details><summary>Why isn’t my tracking showing updates? ${icon('chevron')}</summary><p>A new number can take 24–48 hours to appear after a carrier receives your shipment. Updates may also pause between scans or during customs processing. If the expected delivery date has passed, contact the retailer or carrier with your tracking number.</p></details>
        <details><summary>What if my order arrives in several deliveries? ${icon('chevron')}</summary><p>Furniture and finishing touches often travel separately. Each shipment has its own tracking number. Choose “Track multiple” to enter up to 10 numbers, one per line, and switch between their results.</p></details>
        <details><summary>Can I arrange a delivery or change my address? ${icon('chevron')}</summary><p>This page helps you follow shipments; it doesn’t change delivery instructions. For address changes, appointments, white-glove delivery, or installation, contact your retailer or delivery provider directly.</p></details>
        <details><summary>How is my tracking information used? ${icon('chevron')}</summary><p>Submitting a number sends it to 17TRACK to look up carrier information. Recent numbers stay in this browser only and can be cleared above. We don’t have an account system or store your tracking history on our own server. 17TRACK’s own privacy policy applies to its tracking service.</p></details>
      </div>
    </section>

    <section class="closing-strip"><div class="shell"><span class="mini-flower" aria-hidden="true">✳</span><p>Every detail has a journey.<br class="mobile-break"> <em>Every journey leads home.</em></p><a href="#track" aria-label="Back to shipment tracking">${icon('arrow')}</a></div></section>
  </main>
  <footer class="footer shell"><a class="brand" href="#" aria-label="Nina Elman Interiors home">${brand}</a><p>A thoughtful arrival, by Nina Elman Interiors.</p><span>© ${new Date().getFullYear()} NINA ELMAN INTERIORS</span></footer>
`;

const form = document.querySelector('#tracking-form');
const input = document.querySelector('#tracking-number');
const error = document.querySelector('#tracking-error');
const results = document.querySelector('#results');
const content = document.querySelector('#results-content');
const storageKey = 'nina-elman-tracking-history';
let multiple = false;
let requestId = 0;
let widgetPromise;

function getHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(value) ? value.filter(n => typeof n === 'string' && /^[a-zA-Z0-9-]{5,50}$/.test(n)).slice(0, 4) : [];
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
    button.addEventListener('click', () => { input.value = number; updateInput(); track([number]); });
    list.append(button);
  }
}

function saveHistory(numbers) {
  try { localStorage.setItem(storageKey, JSON.stringify([...new Set([...numbers, ...getHistory()])].slice(0, 4))); } catch { /* Tracking works when browser storage is unavailable. */ }
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
  document.querySelector('#result-eyebrow').textContent = demo ? 'SAMPLE DELIVERY · ILLUSTRATIVE PREVIEW' : 'YOUR DELIVERY';
  document.querySelector('#results-title').textContent = demo ? 'A glimpse of the journey.' : 'The journey to your door.';
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
  const currentRequest = ++requestId;
  const panel = document.querySelector('#live-panel');
  panel.innerHTML = `<div class="live-topline"><div><span class="eyebrow">TRACKING NUMBER</span><h3 id="active-number"></h3></div><a id="carrier-link" class="outline-button" target="_blank" rel="noopener noreferrer">Open in 17TRACK ${icon('external')}</a></div><div class="widget-notice" role="status"><span class="loading-spinner" aria-hidden="true"></span><div><strong>Finding the latest details.</strong><p>Connecting securely to 17TRACK…</p></div></div><div id="tracking-widget"></div><div class="provider-footnote">${icon('globe')} Carrier updates are provided by 17TRACK. Times and estimates may change.</div>`;
  document.querySelector('#active-number').textContent = number;
  document.querySelector('#carrier-link').href = trackingLink(number);
  try {
    const widget = await loadWidget();
    if (currentRequest !== requestId) return;
    widget.trackSingle({ YQ_ContainerId: 'tracking-widget', YQ_Height: 560, YQ_Fc: '0', YQ_Lang: 'en', YQ_Num: number });
    const frame = document.querySelector('#tracking-widget iframe');
    if (frame) frame.title = `17TRACK shipment details for ${number}`;
    panel.querySelector('.widget-notice').innerHTML = `<div>${icon('box')} <strong>Your tracking view</strong><p>17TRACK displays available carrier updates below. If it doesn’t load, use “Open in 17TRACK”.</p></div>`;
    panel.querySelector('.widget-notice').classList.add('widget-connected');
  } catch {
    if (currentRequest !== requestId) return;
    const notice = panel.querySelector('.widget-notice');
    notice.classList.add('widget-unavailable');
    notice.innerHTML = `<span class="fallback-icon">${icon('box')}</span><div><strong>Your tracking link is ready.</strong><p>The embedded tracker couldn’t connect. Open your number directly in 17TRACK to check for updates.</p><button class="text-button retry-widget" type="button">Try connecting again ${icon('arrow')}</button></div>`;
    notice.querySelector('button').addEventListener('click', () => showLiveNumber(number));
  }
}

function track(numbers) {
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
  if (!raw) { setError('Please enter the tracking number from your shipping email.'); return; }
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
  document.querySelector('#tracking-hint').textContent = multiple ? 'Up to 10 tracking numbers, one per line.' : 'You’ll find this in your shipping confirmation email.';
  input.focus();
});
document.querySelector('#clear-recent').addEventListener('click', () => {
  try { localStorage.removeItem(storageKey); } catch { /* Browser storage may be disabled. */ }
  renderHistory();
});
document.querySelector('#close-results').addEventListener('click', () => {
  ++requestId;
  results.hidden = true;
  content.replaceChildren();
  input.focus();
});

document.querySelector('#show-demo').addEventListener('click', () => {
  ++requestId;
  content.innerHTML = `<div class="demo-banner">This is a design preview with example information, not a live shipment.</div>
    <div class="demo-layout"><div class="demo-summary"><div class="demo-status">${icon('truck')} On its way home</div><h3>Your finishing touch<br>is getting closer.</h3><p>Example shipment · Lounge chair</p><div class="demo-estimate"><span class="eyebrow">EXAMPLE DELIVERY WINDOW</span><strong>Thursday, 12 June</strong><span>Delivery timing is illustrative.</span></div><div class="demo-meta"><span>Shipment reference</span><strong>NE–PREVIEW–001</strong><span>Delivery service</span><strong>Example carrier</strong></div></div>
    <div class="demo-timeline"><div class="timeline-heading"><h4>The journey so far</h4><span>EXAMPLE UPDATES</span></div>
      <ol><li class="current"><span class="timeline-marker">${icon('truck')}</span><div><span class="timeline-time">11 JUN · 09:42</span><h5>In transit to your local depot</h5><p>Your piece is on the next leg of its journey.</p></div></li><li><span class="timeline-marker">${icon('check')}</span><div><span class="timeline-time">10 JUN · 16:15</span><h5>Collected by the carrier</h5><p>Carefully packed and ready for the road.</p></div></li><li><span class="timeline-marker">${icon('check')}</span><div><span class="timeline-time">09 JUN · 11:30</span><h5>Delivery details received</h5><p>The first step toward your space.</p></div></li></ol>
      <p class="demo-disclaimer">This styled timeline shows a possible future API integration. Actual tracking uses the 17TRACK view.</p></div></div>`;
  revealResults(true);
});

renderHistory();
