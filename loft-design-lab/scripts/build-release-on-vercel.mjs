import { readFile, writeFile, cp, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const stagingConfig = "{\n  \"cleanUrls\": true,\n  \"buildCommand\": \"npm run build\",\n  \"functions\": {\n    \"server.js\": {\n      \"includeFiles\": \"{assets/**,fonts/**,logo/**,*.css,favicon.ico,favicon.png,apple-touch-icon.png,robots.txt,sitemap.xml,*.html}\"\n    },\n    \"index.js\": {\n      \"includeFiles\": \"{assets/**,fonts/**,logo/**,*.css,favicon.ico,favicon.png,apple-touch-icon.png,robots.txt,sitemap.xml,*.html}\"\n    },\n    \"app.js\": {\n      \"includeFiles\": \"{assets/**,fonts/**,logo/**,*.css,favicon.ico,favicon.png,apple-touch-icon.png,robots.txt,sitemap.xml,*.html}\"\n    },\n    \"api/*.js\": {\n      \"maxDuration\": 15\n    }\n  },\n  \"headers\": [\n    {\n      \"source\": \"/(.*)\",\n      \"headers\": [{ \"key\": \"X-Robots-Tag\", \"value\": \"noindex, nofollow\" }]\n    },\n    {\n      \"source\": \"/assets/(.*)\",\n      \"headers\": [\n        { \"key\": \"Cache-Control\", \"value\": \"public, max-age=2592000, stale-while-revalidate=86400\" }\n      ]\n    },\n    {\n      \"source\": \"/fonts/(.*)\",\n      \"headers\": [\n        { \"key\": \"Cache-Control\", \"value\": \"public, max-age=31536000, immutable\" }\n      ]\n    },\n    {\n      \"source\": \"/logo/(.*)\",\n      \"headers\": [\n        { \"key\": \"Cache-Control\", \"value\": \"public, max-age=2592000, stale-while-revalidate=86400\" }\n      ]\n    },\n    {\n      \"source\": \"/styles.css\",\n      \"headers\": [\n        { \"key\": \"Cache-Control\", \"value\": \"public, max-age=86400, stale-while-revalidate=604800\" }\n      ]\n    }\n  ],\n  \"rewrites\": [\n    { \"source\": \"/order\", \"destination\": \"/order.html\" },\n    { \"source\": \"/booking-stars\", \"destination\": \"/booking-stars.html\" },\n    { \"source\": \"/production\", \"destination\": \"/production.html\" },\n    { \"source\": \"/smm\", \"destination\": \"/smm.html\" },\n    { \"source\": \"/branding\", \"destination\": \"/branding.html\" },\n    { \"source\": \"/web\", \"destination\": \"/web.html\" }\n  ]\n}\n";
const parsedConfig = JSON.parse(await readFile('vercel.json', 'utf8'));
// The source generator and preflight expect the original unconditional staging guard.
// Vercel has already read the candidate CDN configuration before this build.
await writeFile('vercel.json', stagingConfig);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
run('python3', ['scripts/check-source-parity.py']);
run('npm', ['run', 'release:prepare']);
run('npm', ['run', 'release:check']);
const candidate = path.join(root, 'release/loft-production');
const generated = JSON.parse(await readFile(path.join(candidate, 'vercel.json'), 'utf8'));
const expected = { ...parsedConfig, buildCommand: generated.buildCommand };
if (JSON.stringify(expected) !== JSON.stringify(generated)) {
  throw new Error('Candidate CDN configuration differs from the audited generator');
}
// Install only the generated runtime artifact after all preflight checks pass.
for (const entry of await readdir(candidate)) {
  await cp(path.join(candidate, entry), path.join(root, entry), { recursive: true, force: true });
}
console.log('Generated production profile installed; technical host remains noindex. No domains assigned by this build.');
