import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = path.join(root, 'release/loft-production');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--routing-tools')) throw new Error('Usage: node scripts/preflight-production.mjs [--routing-tools /path/to/tools]');
const requireTools = createRequire(path.join(args.length ? path.resolve(args[1]) : root, 'package.json'));
let routing, Ajv, routingVersion;
try {
  routing = requireTools('@vercel/routing-utils');
  const ajv = requireTools('ajv');
  Ajv = ajv.default || ajv;
  routingVersion = requireTools('@vercel/routing-utils/package.json').version;
} catch {
  throw new Error('Official routing validation is required. Install @vercel/routing-utils and ajv in the project dev tools, or pass --routing-tools pointing to an isolated tools installation. No network installation is performed by this script.');
}
const hash = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(await readFile(path.join(artifact, 'release-manifest.json'), 'utf8'));
const config = JSON.parse(await readFile(path.join(artifact, 'vercel.json'), 'utf8'));
assert.equal(manifest.artifact, 'loft-production');
assert.equal(manifest.profile.profile, 'production');
assert.equal(manifest.profile.canonicalOrigin, 'https://www.loft.tj');
assert.equal(manifest.liveReady, false);
for (const [filename, digest] of Object.entries(manifest.files)) {
  assert(!filename.split('/').some(part => part.startsWith('.') || part === 'node_modules'), 'Forbidden release file: ' + filename);
  assert.equal(hash(await readFile(path.join(artifact, filename))), digest, 'Artifact changed after preparation: ' + filename);
}
for (const [filename, digest] of Object.entries(manifest.sourceInputs)) {
  assert.equal(hash(await readFile(path.join(root, filename))), digest, 'Runtime input changed after candidate preparation; regenerate the release: ' + filename);
}
const sourceConfig = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
assert(sourceConfig.headers.some(rule => !rule.has && !rule.missing && rule.headers.some(header => header.key.toLowerCase() === 'x-robots-tag' && header.value.includes('noindex'))), 'Default staging CDN guard must remain unconditional');
const validator = new Ajv({ allErrors: true, strict: false });
for (const [key, schema] of [['headers', routing.headersSchema], ['redirects', routing.redirectsSchema], ['rewrites', routing.rewritesSchema]]) {
  const validate = validator.compile(schema);
  assert(validate(config[key] || []), 'Invalid Vercel ' + key + ': ' + JSON.stringify(validate.errors));
}
const transformed = routing.getTransformedRoutes(JSON.parse(JSON.stringify(config)));
assert(!transformed.error, 'Official Vercel route conversion failed: ' + JSON.stringify(transformed.error));
const hostGuard = config.headers.find(rule => rule.source === '/(.*)' && rule.missing?.some(condition => condition.type === 'host') && rule.headers.some(header => header.key.toLowerCase() === 'x-robots-tag' && header.value === 'noindex, nofollow'));
assert(hostGuard, 'Missing CDN-wide noncanonical host indexing guard');
const condition = hostGuard.missing.find(condition => condition.type === 'host');
assert.equal(condition.value, '^www\\.loft\\.tj$');
for (const hostname of ['', 'codex-projects-seven.vercel.app', 'production-deployment.vercel.app', 'localhost', 'loft.tj', 'www.loft.tj.evil', 'WWW.LOFT.TJ', 'www.loft.tj:443']) {
  assert(!new RegExp(condition.value).test(hostname), 'CDN guard must close non-exact canonical host: ' + hostname);
}
assert(new RegExp(condition.value).test('www.loft.tj'));
console.log('Official Vercel routing schemas and conversion passed (@vercel/routing-utils ' + routingVersion + ').');

const requireSource = createRequire(path.join(root, 'server.js'));
const requireCandidate = createRequire(path.join(artifact, 'server.js'));
const sourceApp = requireSource('./server.js');
const candidateApp = requireCandidate('./server.js');
const listen = (app, port) => new Promise((resolve, reject) => {
  const server = app.listen(port, '127.0.0.1', () => resolve(server));
  server.once('error', reject);
});
const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
const request = (port, pathname, hostname, extraHeaders = {}) => new Promise((resolve, reject) => {
  // Always contact loopback. Host is a fixture; redirects are inspected, never followed.
  const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'GET', headers: { Host: hostname, ...extraHeaders }, timeout: 5000 }, response => {
    const chunks = [];
    response.on('data', chunk => chunks.push(chunk));
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('timeout', () => req.destroy(new Error('Local preflight request timed out')));
  req.on('error', reject);
  req.end();
});
const schemas = html => [...html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)].map(match => JSON.parse(match[1]));
const indexable = response => assert.equal(response.headers['x-robots-tag'], 'index, follow');
const closed = response => assert.match(response.headers['x-robots-tag'] || '', /noindex/);
const checks = [];
let sourceServer, candidateServer;
try {
  sourceServer = await listen(sourceApp, 3107);
  candidateServer = await listen(candidateApp, 3108);
  for (const hostname of ['www.loft.tj', 'codex-projects-seven.vercel.app', 'localhost']) {
    const response = await request(3107, '/', hostname);
    assert.equal(response.status, 200); closed(response);
  }
  checks.push('Staging remains noindex, including a canonical Host spoof');
  const pages = ['index', 'production', 'smm', 'branding', 'web', 'booking-stars', 'order'];
  for (const page of pages) {
    const pathname = page === 'index' ? '/' : '/' + page;
    const response = await request(3108, pathname, 'www.loft.tj');
    assert.equal(response.status, 200, pathname); indexable(response);
    assert(response.body.includes('<link rel="canonical" href="https://www.loft.tj' + pathname + '">'), 'Canonical mismatch: ' + pathname);
    const original = await readFile(path.join(root, page + '.html'), 'utf8');
    assert.equal(response.body.match(/<title>[\s\S]*?<\/title>/i)?.[0], original.match(/<title>[\s\S]*?<\/title>/i)?.[0]);
    const expectedSchemas = schemas(original).filter(schema => page !== 'index' || schema['@type'] !== 'FAQPage');
    assert.deepEqual(schemas(response.body), expectedSchemas, 'Unexpected schema change: ' + pathname);
  }
  assert.equal(manifest.removedUnsupportedHomepageFaqBlocks, 1);
  checks.push('All seven canonical pages return200 with source titles/canonicals and indexability; only unsupported homepage FAQPage removed');
  for (const hostname of ['codex-projects-seven.vercel.app', 'some-production-deployment.vercel.app', 'www.loft.tj.evil', 'localhost']) {
    for (const pathname of ['/', '/production', '/robots.txt', '/sitemap.xml', '/assets/js/loft-cinema.js']) {
      const response = await request(3108, pathname, hostname);
      assert.equal(response.status, 200, hostname + pathname); closed(response);
    }
  }
  const spoof = await request(3108, '/', 'codex-projects-seven.vercel.app', { 'X-Forwarded-Host': 'www.loft.tj' });
  assert.equal(spoof.status, 200); closed(spoof);
  checks.push('Candidate noncanonical hosts stay noindex for HTML, robots, sitemap and JS; forwarded host cannot enable indexing');
  for (const [alias, target] of [['/index.html', '/'], ['/index', '/'], ['/index/', '/'], ['/production.html', '/production'], ['/production/', '/production']]) {
    const response = await request(3108, alias + '?utm_source=preflight', 'www.loft.tj');
    assert.equal(response.status, 301, alias);
    assert.equal(response.headers.location, 'https://www.loft.tj' + target + '?utm_source=preflight');
    closed(response);
  }
  for (const hostname of ['loft.tj', 'LOFT.TJ:443']) {
    const response = await request(3108, '/production?utm_source=preflight', hostname);
    assert.equal(response.status, 301);
    assert.equal(response.headers.location, 'https://www.loft.tj/production?utm_source=preflight');
  }
  checks.push('Canonical host and known index/HTML/trailing aliases preserve paths and query strings in permanent redirects');
  for (const pathname of ['/definitely-not-a-page', '/sculpture.html', '/src/loft-cinema.js', '/production-profile.json', '/app.js', '/index.js', '/api/chat.js']) {
    const response = await request(3108, pathname, 'www.loft.tj');
    assert.equal(response.status, 404, pathname); closed(response);
  }
  const api = await request(3108, '/api/chat', 'www.loft.tj');
  assert.equal(api.status, 404); closed(api);
  assert(config.headers.some(rule => rule.source === '/api/:path*' && rule.headers.some(header => header.key === 'X-Robots-Tag' && header.value.includes('noindex'))));
  assert(!config.redirects.some(rule => rule.source === '/:path*'), 'Canonical redirects must not unintentionally include API requests');
  checks.push('Unknown/technical/archive paths remain real404/noindex; no API POST or real message was sent');
  for (const pathname of ['/robots.txt', '/sitemap.xml']) {
    const response = await request(3108, pathname, 'www.loft.tj');
    assert.equal(response.body, await readFile(path.join(root, pathname.slice(1)), 'utf8'));
  }
  for (const pathname of ['/assets/js/loft-cinema.js', '/assets/js/loft-pages.js', '/loft-cinema.css', '/styles.css']) {
    const response = await request(3108, pathname, 'www.loft.tj');
    assert.equal(response.status, 200); assert.equal(response.headers['cache-control'], 'public, max-age=0, must-revalidate');
    assert(config.headers.some(rule => rule.source === pathname && rule.headers.some(header => header.key === 'Cache-Control' && header.value === 'public, max-age=0, must-revalidate')));
  }
  checks.push('Original robots/sitemap preserved; stable JS/CSS uses revalidation in app and CDN configuration');
  const report = { checkedAt: new Date().toISOString(), status: 'LOCAL_PREFLIGHT_PASS_LIVE_GATES_PENDING', artifactDigest: manifest.artifactDigest, sourceGitCommit: manifest.sourceGitCommit, officialRoutingUtilsVersion: routingVersion, checks, liveReady: false, requiredLiveChecks: manifest.requiredLiveChecks };
  await writeFile(path.join(root, 'release/loft-production-preflight.json'), JSON.stringify(report, null, 2) + '\n');
  for (const check of checks) console.log('PASS: ' + check);
  console.log('LOCAL PREFLIGHT PASSED. Not deployed; live CDN/DNS/TLS, delivery credentials and cutover approval remain unverified.');
} finally {
  if (candidateServer) await close(candidateServer);
  if (sourceServer) await close(sourceServer);
}
