import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
let html = await readFile(resolve(dist, 'index.html'), 'utf8');
const dataURL = async (path, mime) => `data:${mime};base64,${(await readFile(path)).toString('base64')}`;
const scriptTag = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const styleTag = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if (!scriptTag || !styleTag) throw new Error('Expected one Vite JavaScript and CSS entry.');
const scriptPath = resolve(dist, scriptTag[1]);
const stylePath = resolve(dist, styleTag[1]);
let css = await readFile(stylePath, 'utf8');
for (const match of [...css.matchAll(/url\(([^)]+)\)/g)]) {
  const ref = match[1].replace(/^['"]|['"]$/g, '');
  if (ref.startsWith('data:')) continue;
  const mime = ref.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
  css = css.replace(match[0], `url('${await dataURL(resolve(dirname(stylePath), ref), mime)}')`);
}
const assets = {
  'nina-elman-logo.png': await dataURL(resolve(dist, 'nina-elman-logo.png'), 'image/png'),
  'nina-elman-interior.jpg': await dataURL(resolve(dist, 'nina-elman-interior.jpg'), 'image/jpeg'),
};
const script = `window.__NINA_INLINE_ASSETS__ = ${JSON.stringify(assets)};\n${await readFile(scriptPath, 'utf8')}`;
html = html.replace(scriptTag[0], '');
html = html.replace(styleTag[0], () => `<style>${css}</style>`);
html = html.replace('href="./favicon.svg"', `href="${await dataURL(resolve(dist, 'favicon.svg'), 'image/svg+xml')}"`);
html = html.replace('</body>', () => `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script></body>`);
html = html.replace(/^[\t ]+$/gm, '');
await mkdir(resolve(root, 'downloads'), { recursive: true });
const output = resolve(root, 'downloads/nina-elman-tracking.html');
await writeFile(output, html);
console.log('Created downloads/nina-elman-tracking.html: open directly in a browser; no install needed.');
