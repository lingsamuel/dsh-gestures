import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import pkg from '../package.json' with { type: 'json' }

await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['src/client.jsx'],
  outfile: 'dist/client.js',
  bundle: true,
  format: 'cjs',
  jsx: 'automatic',
  platform: 'browser',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives'],
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => { const module = { exports: {} };`,
  },
  footer: { js: 'return module.exports; } });' },
})
