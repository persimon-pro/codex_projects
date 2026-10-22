const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'preview', 'loft-preview.html'));
const types = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
const cache = new Map();
function inlineAsset(reference, fromDirectory = '') {
  if (/^(https?:|data:|#)/.test(reference) || !reference) return reference;
  const base = reference.startsWith('/') ? root : path.resolve(root, fromDirectory);
  const filename = path.resolve(base, reference.split('?')[0].replace(/^\//, ''));
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename)) return reference;
  if (!cache.has(filename)) cache.set(filename, `data:${types[path.extname(filename)] || 'application/octet-stream'};base64,${fs.readFileSync(filename).toString('base64')}`);
  return cache.get(filename);
}
function inlineStyles(filename) {
  return fs.readFileSync(path.join(root, filename), 'utf8').replace(/url\(['"]?([^'"\)]+)['"]?\)/g, (_, reference) => `url("${inlineAsset(reference, path.dirname(filename))}")`);
}

if (!fs.existsSync(path.join(root, 'assets/js/loft-cinema.js'))) {
  throw new Error('Run npm run build before exporting the preview.');
}
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// The portable homepage needs the team portraits, not several megabytes of
// embedded video. Change only this generated copy; the website keeps its clips.
html = html.replace(/(<section\b[^>]*\bid=["']artists["'][^>]*>)([\s\S]*?)(<\/section>)/i, (_, opening, content, closing) => {
  const portraits = content.replace(/<video\b([^>]*)>[\s\S]*?<\/video\s*>/gi, (video, attributes) => {
    const poster = attributes.match(/\bposter\s*=\s*(["'])(.*?)\1/i);
    return poster ? `<img src="${poster[2]}" alt="" loading="lazy" decoding="async">` : video;
  });
  return opening + portraits + closing;
});
html = html.replace(/<link rel="stylesheet" href="([^":]+\.css)">/g, (_, filename) => `<style>${inlineStyles(filename)}</style>`);
html = html.replace(/\b(src|poster|href)="([^"\s]+\.(?:webp|png|jpg|jpeg|gif|svg|ico|woff2|ttf|mp4)(?:\?[^"\s]*)?)"/g, (_, attribute, reference) => `${attribute}="${inlineAsset(reference)}"`);
const placeholder = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="800" height="450" fill="#171716"/><path d="M0 0 800 450M800 0 0 450" stroke="#242421"/><circle cx="400" cy="225" r="42" fill="none" stroke="#6f6b62"/><path d="m390 208 27 17-27 17z" fill="#c8c2b6"/></svg>').toString('base64');
html = html.replace(/(<img\b[^>]*\bsrc=")https:\/\/img\.youtube\.com\/[^"\s]+/g, `$1${placeholder}`);
const deviceFallbacks = ['camera', 'microphone', 'laptop', 'instagram'].map(name => inlineAsset(`assets/images/cinema/${name}.svg`));
html = html.replace(/<script src="assets\/js\/loft-cinema\.js(?:\?[^"\s]*)?" defer><\/script>/, () => `<script>window.__LOFT_DEVICE_FALLBACKS__=${JSON.stringify(deviceFallbacks)};</script><script>${fs.readFileSync(path.join(root, 'assets/js/loft-cinema.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`);
const notice = `
<style>.loft-preview-note{position:fixed;bottom:14px;left:14px;max-width:calc(100vw - 28px);padding:11px 16px;background:#151513f2;border:1px solid #ffffff25;color:#c5c0b5;font:11px/1.5 sans-serif;z-index:10001;box-shadow:0 4px 20px #0005}.loft-preview-note button{margin-left:12px;border:0;background:none;color:inherit;cursor:pointer;font-size:16px}.loft-preview-note[hidden]{display:none}</style>
<div class="loft-preview-note" role="status" hidden><span id="previewNoteText">Предпросмотр новой главной. Внутренние страницы и чат доступны в полном проекте.</span><button type="button" aria-label="Закрыть подсказку" onclick="this.parentElement.hidden=true">×</button></div>
<script>
document.addEventListener('click', function(event) {
  const target=event.target.closest('a[href^="/"], #loftAiFloatTrigger');
  if(!target)return;
  event.preventDefault();event.stopImmediatePropagation();
  document.querySelector('.loft-preview-note').hidden=false;
  document.getElementById('previewNoteText').textContent='Это автономный просмотр главной страницы. Для заявки, чата и внутренних страниц запустите полную версию проекта.';
},true);
</script>`;
html = html.replace('</body>', notice + '\n</body>');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html);
console.log(`Standalone homepage preview: ${output} (${(Buffer.byteLength(html) / 1048576).toFixed(1)} MiB)`);
