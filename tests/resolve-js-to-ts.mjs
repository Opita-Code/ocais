/**
 * Custom Node.js loader that resolves .js → .ts imports.
 * 
 * Node 24's --experimental-strip-types strips types but does NOT resolve
 * .js extension imports to .ts files. This loader adds that resolution.
 * 
 * Usage: node --experimental-loader ./tests/resolve-js-to-ts.mjs --experimental-strip-types --test ...
 */
import { readFileSync } from 'node:fs';
import { resolve as pathResolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('file://') || specifier.startsWith('/')) {
    const baseUrl = context.parentURL || pathToFileURL(process.cwd() + '/').href;
    const basePath = fileURLToPath(baseUrl);
    const baseDir = extname(basePath) ? basePath.split(/[/\\]/).slice(0, -1).join('/') : basePath;
    
    let resolvedPath;
    if (specifier.startsWith('file://')) {
      resolvedPath = fileURLToPath(specifier);
    } else if (specifier.startsWith('/')) {
      resolvedPath = specifier;
    } else {
      resolvedPath = pathResolve(baseDir, specifier);
    }

    if (resolvedPath.endsWith('.js')) {
      const tsPath = resolvedPath.replace(/\.js$/, '.ts');
      try {
        readFileSync(tsPath);
        return nextResolve(pathToFileURL(tsPath).href);
      } catch {
        // .ts doesn't exist, try original .js
      }
    }
  }
  return nextResolve(specifier, context);
}
