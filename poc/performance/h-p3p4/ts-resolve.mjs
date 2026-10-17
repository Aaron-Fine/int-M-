// Resolve extensionless relative imports to .ts / index.ts (read-only use of repo src/).
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    const p = fileURLToPath(base);
    if (!existsSync(p) || statSync(p).isDirectory()) {
      for (const cand of [p + '.ts', p + '/index.ts']) {
        if (existsSync(cand)) return next(new URL('file://' + cand).href, context);
      }
    }
  }
  return next(specifier, context);
}
