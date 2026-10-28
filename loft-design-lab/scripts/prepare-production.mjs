import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://www.loft.tj';
const pages = ['index', 'production', 'smm', 'branding', 'web', 'booking-stars', 'order'];
const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
if (option('--profile') !== 'production' || option('--origin') !== origin || args.some((arg, index) => index % 2 === 0 && !['--profile', '--origin'].includes(arg)) || args.length !== 4) {
  throw new Error('Explicit command required: node scripts/prepare-production.mjs --profile production --origin https://www.loft.tj');
}
const hash = data => createHash('sha256').update(data).digest('hex');
const releaseRoot = path.join(root, 'release');
const destination = path.join(releaseRoot, 'loft-production');
const profile = { schemaVersion: 1, profile: 'production', canonicalOrigin: origin, canonicalHost: 'www.loft.tj', apexHost: 'loft.tj' };

// This guard is generated only inside the explicit production artifact.
const policy = `'use strict';
const profile = require('./production-profile.json');
const canonicalOrigin = 'https://www.loft.tj';
const pages = new Set(['/', '/production', '/smm', '/branding', '/web', '/booking-stars', '/order']);
const configured = profile.profile === 'production' && profile.canonicalOrigin === canonicalOrigin && profile.canonicalHost === 'www.loft.tj';
const normalizeHost = value => {
  if (typeof value !== 'string' || !/^[a-z0-9.-]+(?::\\d+)?$/i.test(value)) return null;
  return value.toLowerCase().replace(/:\\d+$/, '').replace(/\\.$/, '');
};
module.exports = (req, res, next) => {
  const host = normalizeHost(req.headers.host);
  const canonical = configured && host === 'www.loft.tj';
  const pathname = req.path;
  const technical = /^(?:\\/api(?:\\/|$)|\\/src(?:\\/|$)|\\/scripts(?:\\/|$)|\\/migration(?:\\/|$)|\\/preview(?:\\/|$)|\\/sculpture(?:\\.html)?$)/.test(pathname);
  const writeHead = res.writeHead;
  res.writeHead = function (status, ...rest) {
    this.setHeader('X-Robots-Tag', canonical && !technical && status >= 200 && status < 300 ? 'index, follow' : 'noindex, nofollow');
    if (/\\.(?:js|css)$/.test(pathname) || pages.has(pathname) || /^\\/(?:robots\\.txt|sitemap(?:\\.xml)?)$/.test(pathname)) {
      this.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    return writeHead.call(this, status, ...rest);
  };
  if (!host) return res.status(400).send('Invalid Host');
  if (/^\\/(?:src|scripts|migration|preview)(?:\\/|$)/.test(pathname) || /^\\/(?:app\\.js|index\\.js|production-policy\\.cjs|production-profile\\.json|release-manifest\\.json)$/.test(pathname) || /^\\/api\\/.*\\.(?:js|json)$/.test(pathname)) {
    return res.status(404).send('Not Found');
  }
  // Redirect document GET/HEAD only. API methods and bodies are never redirected here.
  if (configured && (req.method === 'GET' || req.method === 'HEAD') && !pathname.startsWith('/api/')) {
    let clean = pathname.replace(/\\/+$/, '') || '/';
    if (clean === '/index' || clean === '/index.html') clean = '/';
    else if (clean.endsWith('.html')) clean = clean.slice(0, -5);
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    if ((host === 'loft.tj' && pages.has(clean)) || (canonical && pages.has(clean) && pathname !== clean)) {
      return res.redirect(301, canonicalOrigin + clean + query);
    }
  }
  next();
};
`;

async function filesWithin(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not allowed in a release: ' + relative);
    if (entry.isDirectory()) result.push(...await filesWithin(path.join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative.split(path.sep).join('/'));
  }
  return result;
}
const forbidden = filename => filename.split('/').some(part => part.startsWith('.') || part === 'node_modules' || /^(?:credentials?|secrets?)(?:\.|$)/i.test(part)) || /\.(?:pem|key|p12|pfx)$/i.test(filename);

await mkdir(releaseRoot, { recursive: true });
if ((await lstat(releaseRoot)).isSymbolicLink()) throw new Error('Release directory must not be a symlink');
const temporary = await mkdtemp(path.join(releaseRoot, '.loft-production-'));
try {
  const rootFiles = ['server.js', 'app.js', 'index.js', 'vercel.json', 'package.json', 'package-lock.json', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'favicon.png', 'apple-touch-icon.png', ...pages.map(page => page + '.html'), ...(await readdir(root)).filter(name => name.endsWith('.css'))];
  const inputs = [...new Set(rootFiles)];
  for (const directory of ['assets', 'fonts', 'logo', 'api', 'src']) {
    for (const file of await filesWithin(path.join(root, directory))) inputs.push(directory + '/' + file);
  }
  inputs.push('scripts/build-3d.js');
  const sourceInputs = {};
  for (const filename of inputs.sort()) {
    if (forbidden(filename)) throw new Error('Excluded sensitive/unexpected release input: ' + filename);
    const source = path.join(root, filename);
    if ((await lstat(source)).isSymbolicLink()) throw new Error('Release input must not be a symlink: ' + filename);
    const bytes = await readFile(source);
    sourceInputs[filename] = hash(bytes);
    await mkdir(path.dirname(path.join(temporary, filename)), { recursive: true });
    await cp(source, path.join(temporary, filename));
  }
  for (const name of ['loft-cinema.js', 'loft-pages.js', 'loft-cinema.css', 'loft-pages.css']) {
    await lstat(path.join(temporary, 'assets/js', name)).catch(() => { throw new Error('Run npm run build before preparing production: missing ' + name); });
  }
  const serverPath = path.join(temporary, 'server.js');
  let server = await readFile(serverPath, 'utf8');
  const stagingGuard = /app\.use\(\(req, res, next\) => \{\s*res\.set\(["']X-Robots-Tag["'],\s*["']noindex, nofollow["']\);\s*next\(\);\s*\}\);/g;
  if ([...server.matchAll(stagingGuard)].length !== 1) throw new Error('Expected exactly one recognizable staging guard; refusing an unsafe production transform');
  server = server.replace(stagingGuard, "app.use(require('./production-policy.cjs'));");
  // The generated policy owns the canonical host redirect; retain the source app otherwise.
  const originalRedirect = /app\.use\(\(req, res, next\) => \{\s*const host = req\.headers\.host \|\| '';\s*if \(host === 'loft\.tj'\) \{\s*return res\.redirect\(301, `https:\/\/www\.loft\.tj\$\{req\.url\}`\);\s*\}\s*next\(\);\s*\}\);/g;
  if ([...server.matchAll(originalRedirect)].length !== 1) throw new Error('Expected the audited source host redirect; refusing an unsafe production transform');
  server = server.replace(originalRedirect, '');
  await writeFile(serverPath, server);
  await writeFile(path.join(temporary, 'production-policy.cjs'), policy);
  await writeFile(path.join(temporary, 'production-profile.json'), JSON.stringify(profile, null, 2) + '\n');

  let removedFaqBlocks = 0;
  const homePath = path.join(temporary, 'index.html');
  const home = (await readFile(homePath, 'utf8')).replace(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi, (tag, json) => {
    const data = JSON.parse(json);
    if (data['@type'] !== 'FAQPage') return tag;
    removedFaqBlocks += 1;
    return '';
  });
  if (removedFaqBlocks !== 1) throw new Error('Expected the one audited unsupported homepage FAQPage block; review the source before changing this transform');
  await writeFile(homePath, home);

  const packagePath = path.join(temporary, 'package.json');
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  pkg.scripts = { build: 'node scripts/build-3d.js', start: 'node server.js', prestart: 'npm run build' };
  await writeFile(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  const config = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  const cache = 'public, max-age=0, must-revalidate';
  config.headers = config.headers.filter(rule => !rule.headers.some(header => header.key.toLowerCase() === 'x-robots-tag'));
  config.headers.unshift({ source: '/(.*)', missing: [{ type: 'host', value: '^www\\.loft\\.tj$' }], headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] });
  for (const source of ['/api/:path*', '/src/:path*', '/scripts/:path*', '/migration/:path*', '/preview/:path*', '/app.js', '/index.js', '/server.js', '/production-policy.cjs', '/production-profile.json', '/release-manifest.json']) {
    config.headers.push({ source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] });
  }
  for (const page of [...pages.map(page => page === 'index' ? '/' : '/' + page), '/robots.txt', '/sitemap.xml', '/sitemap']) {
    config.headers.push({ source: page, headers: [{ key: 'Cache-Control', value: cache }] });
  }
  for (const filename of [...rootFiles.filter(file => file.endsWith('.css')), 'assets/js/loft-cinema.js', 'assets/js/loft-pages.js', 'assets/js/loft-experience.js', 'assets/js/loft-cinema.css', 'assets/js/loft-pages.css']) {
    config.headers.push({ source: '/' + filename, headers: [{ key: 'Cache-Control', value: cache }] });
  }
  config.trailingSlash = false;
  config.redirects = [
    ...pages.map(page => ({ source: page === 'index' ? '/' : '/' + page, has: [{ type: 'host', value: '^loft\\.tj$' }], destination: origin + (page === 'index' ? '/' : '/' + page), permanent: true })),
    { source: '/index', destination: '/', permanent: true },
    { source: '/index.html', destination: '/', permanent: true },
  ];
  for (const entry of Object.values(config.functions || {})) {
    if (entry.includeFiles?.startsWith('{')) entry.includeFiles = entry.includeFiles.replace(/\}$/, ',production-policy.cjs,production-profile.json}');
  }
  await writeFile(path.join(temporary, 'vercel.json'), JSON.stringify(config, null, 2) + '\n');

  const files = {};
  for (const filename of await filesWithin(temporary)) files[filename] = hash(await readFile(path.join(temporary, filename)));
  const manifest = {
    schemaVersion: 1, artifact: 'loft-production', profile, preparedAt: new Date().toISOString(),
    sourceGitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceWorktreeDirty: Boolean(execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: root, encoding: 'utf8' }).trim()),
    sourceInputs, files, artifactDigest: hash(JSON.stringify(files)), removedUnsupportedHomepageFaqBlocks: removedFaqBlocks,
    liveReady: false,
    requiredLiveChecks: ['DNS/TLS and HTTP-to-HTTPS', 'Real Vercel CDN canonical/noncanonical headers', 'Production credentials and permitted lead-delivery test', 'Search Console baseline and rollout/rollback approval'],
  };
  await writeFile(path.join(temporary, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  try {
    const existing = await lstat(destination);
    if (existing.isSymbolicLink()) throw new Error('Existing release must not be a symlink');
    const previous = JSON.parse(await readFile(path.join(destination, 'release-manifest.json'), 'utf8'));
    if (previous.artifact !== 'loft-production') throw new Error('Refusing to replace a directory not created by this generator');
    const previousFiles = await filesWithin(destination);
    if (previousFiles.some(file => file !== 'release-manifest.json' && !Object.hasOwn(previous.files, file))) throw new Error('Existing artifact contains extra local files; preserve them before regenerating');
    for (const [file, digest] of Object.entries(previous.files)) {
      if (hash(await readFile(path.join(destination, file))) !== digest) throw new Error('Existing artifact has local edits; preserve them before regenerating: ' + file);
    }
    await rm(destination, { recursive: true });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await rename(temporary, destination);
  console.log('Prepared offline candidate: ' + destination);
  console.log('Artifact digest: ' + manifest.artifactDigest);
  console.log('Removed one unsupported homepage FAQPage block; source HTML and staging configuration were not changed.');
  console.log('NOT deployed. Run preflight-production.mjs with an official routing validator; live CDN/DNS/TLS checks remain required.');
} catch (error) {
  await rm(temporary, { recursive: true, force: true });
  throw error;
}
