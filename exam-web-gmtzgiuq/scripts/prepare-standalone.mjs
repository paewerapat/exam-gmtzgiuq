import { cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  console.error('standalone folder not found — make sure next.config has output: "standalone"');
  process.exit(1);
}

// Copy .next/static → .next/standalone/.next/static
const staticSrc = join(root, '.next', 'static');
const staticDest = join(standalone, '.next', 'static');
if (existsSync(staticSrc)) {
  cpSync(staticSrc, staticDest, { recursive: true });
  console.log('✓ Copied .next/static → standalone/.next/static');
}

// Copy public → .next/standalone/public
const publicSrc = join(root, 'public');
const publicDest = join(standalone, 'public');
if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
  console.log('✓ Copied public → standalone/public');
}

// Copy .env → .next/standalone/.env (if exists)
const envSrc = join(root, '.env');
const envDest = join(standalone, '.env');
if (existsSync(envSrc)) {
  cpSync(envSrc, envDest);
  console.log('✓ Copied .env → standalone/.env');
}

console.log('\nStandalone ready! Upload .next/standalone/ to Plesk.');
