#!/usr/bin/env node
// Deploys exam-web-gmtzgiuq (Next.js standalone) -> httpdocs
// and exam-api-gmtzgiuq (NestJS dist) -> api.lumo-test.com over FTP.
//
// Usage:
//   npm run deploy                       deploy both apps (build + upload)
//   npm run deploy -- frontend           deploy only the frontend
//   npm run deploy -- backend            deploy only the backend
//   npm run deploy -- --skip-build       reuse the existing local build output
//   npm run deploy -- --skip-node-modules  frontend only: don't re-upload node_modules

import { Client } from 'basic-ftp';
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv(path.join(__dirname, '.env'));
const { FTP_HOST, FTP_PORT, FTP_USER, FTP_PASSWORD, FTP_SECURE } = env;
if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
  console.error('Missing FTP_HOST / FTP_USER / FTP_PASSWORD in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const targets = args.filter((a) => !a.startsWith('--'));
const doFrontend = targets.length === 0 || targets.includes('frontend');
const doBackend = targets.length === 0 || targets.includes('backend');
const skipBuild = flags.has('--skip-build');
const skipNodeModules = flags.has('--skip-node-modules');

const FRONTEND_DIR = path.join(__dirname, 'exam-web-gmtzgiuq');
const BACKEND_DIR = path.join(__dirname, 'exam-api-gmtzgiuq');
const STANDALONE_DIR = path.join(FRONTEND_DIR, '.next', 'standalone');
const DIST_DIR = path.join(BACKEND_DIR, 'dist');

function run(cmd, cwd) {
  console.log(`\n$ ${cmd}  (in ${path.relative(__dirname, cwd) || '.'})`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

async function touchRestart(client, remoteDir) {
  const content = Buffer.from(`restart: ${new Date().toISOString()}\n`);
  await client.uploadFrom(Readable.from(content), `${remoteDir}/tmp/restart.txt`);
  console.log(`  restarted (touched ${remoteDir}/tmp/restart.txt)`);
}

async function deployFrontend(client) {
  if (!skipBuild) run('npm run build', FRONTEND_DIR);
  if (!existsSync(STANDALONE_DIR)) {
    throw new Error(`Standalone build not found at ${STANDALONE_DIR}. Did the build succeed?`);
  }

  console.log('\nUploading frontend -> /httpdocs');
  await client.ensureDir('/httpdocs'); // creates if missing, and cd's into it

  if (skipNodeModules) {
    for (const entry of readdirSync(STANDALONE_DIR, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const local = path.join(STANDALONE_DIR, entry.name);
      const remote = `/httpdocs/${entry.name}`;
      if (entry.isDirectory()) {
        await client.uploadFromDir(local, remote);
      } else {
        await client.uploadFrom(local, remote);
      }
      console.log(`  uploaded ${entry.name}`);
    }
  } else {
    await client.uploadFromDir(STANDALONE_DIR, '.');
    console.log('  uploaded standalone build (incl. node_modules)');
  }

  await touchRestart(client, '/httpdocs');
}

async function deployBackend(client) {
  if (!skipBuild) run('npm run build', BACKEND_DIR);
  if (!existsSync(DIST_DIR)) {
    throw new Error(`dist/ not found at ${DIST_DIR}. Did the build succeed?`);
  }

  console.log('\nUploading backend -> /api.lumo-test.com');
  await client.ensureDir('/api.lumo-test.com'); // creates if missing, and cd's into it

  await client.uploadFromDir(DIST_DIR, '.');
  console.log('  uploaded dist/');

  for (const file of ['package.json', 'package-lock.json', '.env']) {
    const local = path.join(BACKEND_DIR, file);
    if (existsSync(local)) {
      await client.uploadFrom(local, `/api.lumo-test.com/${file}`);
      console.log(`  uploaded ${file}`);
    }
  }

  console.log('  NOTE: node_modules was NOT uploaded (bcrypt has native bindings that');
  console.log('  would break if built on Windows and run on the Linux server). If');
  console.log('  package.json dependencies changed, click "NPM Install" in the Plesk');
  console.log('  Node.js app panel for api.lumo-test.com after this deploy.');

  await touchRestart(client, '/api.lumo-test.com');
}

async function main() {
  const client = new Client();
  client.ftp.verbose = false;
  try {
    await client.access({
      host: FTP_HOST,
      port: FTP_PORT ? Number(FTP_PORT) : 21,
      user: FTP_USER,
      password: FTP_PASSWORD,
      secure: FTP_SECURE === 'true',
    });

    if (doFrontend) await deployFrontend(client);
    if (doBackend) await deployBackend(client);

    console.log('\nDeploy finished.');
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error('\nDeploy failed:', err.message);
  process.exit(1);
});
