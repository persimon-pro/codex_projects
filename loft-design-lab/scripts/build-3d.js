const { build } = require('esbuild');

build({
  entryPoints: ['src/loft-experience.js', 'src/loft-cinema.js', 'src/loft-pages.js'],
  outdir: 'assets/js',
  assetNames: 'fonts/[name]-[hash]',
  loader: { '.woff2': 'file', '.woff': 'file' },
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'eof',
  logLevel: 'info',
}).catch(() => process.exit(1));
