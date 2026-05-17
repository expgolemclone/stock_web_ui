#!/usr/bin/env node
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PARENT = resolve(ROOT, '..');
const STATE_DIR = existsSync(join(ROOT, '.jj')) ? join(ROOT, '.jj') : join(ROOT, '.git');
const STATE_FILE = join(STATE_DIR, 'downstream-ui-check-state.json');
const FORCE = process.argv.includes('--force');

const DATA_FILES = [
  ['stock_db', 'var/db/stocks.db'],
  ['japan_company_handbook', 'data/stock_performance.db'],
  ['land_value_research', 'data/land.db'],
];

const DOWNSTREAMS = [
  {
    name: 'formula_screening',
    headers: ['code', 'name', 'price', 'ncr', 'per_a'],
  },
  {
    name: 'invest_like_legends',
    headers: ['code', 'name', 'price', 'amount', 'ratio'],
    bodyPattern: /億/,
  },
  {
    name: 'land_value_research',
    headers: ['code', 'name', 'price', 'est_val', 'mcap', 'bv', 'gain'],
  },
];

const SURFACE_PATHS = [
  '.githooks',
  '.claude/hooks',
  'docs/assets/columns.js',
  'docs/assets/columns.d.ts',
  'docs/assets/stock-table.js',
  'docs/assets/stock-table.d.ts',
  'docs/assets/style.css',
  'docs/index.template.html',
  'package.json',
  'package-lock.json',
  'scripts/check_downstream_ui.mjs',
  'scripts/downstream_server.py',
  'src',
  'src_ts',
];

async function main() {
  assertPrerequisites();

  const surfaceHash = hashSurface();
  if (!FORCE && existsSync(STATE_FILE) && readFileSync(STATE_FILE, 'utf8').trim() === surfaceHash) {
    console.log('downstream UI check skipped: shared UI surface is unchanged');
    return;
  }

  const browser = await chromium.launch({
    executablePath: findBrowserExecutable() ?? undefined,
  });
  try {
    for (const downstream of DOWNSTREAMS) {
      await checkDownstream(browser, downstream);
    }
  } finally {
    await browser.close();
  }

  await mkdir(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${surfaceHash}\n`, 'utf8');
  console.log('downstream UI check passed');
}

function assertPrerequisites() {
  for (const downstream of DOWNSTREAMS) {
    const repo = join(PARENT, downstream.name);
    if (!existsSync(repo)) {
      throw new Error(`required downstream repo is missing: ${repo}`);
    }
    if (!existsSync(join(repo, 'pyproject.toml'))) {
      throw new Error(`required downstream repo is not a Python project: ${repo}`);
    }
  }

  for (const [repo, file] of DATA_FILES) {
    const path = join(PARENT, repo, file);
    if (!existsSync(path) || statSync(path).size === 0) {
      throw new Error(`required real DB file is missing or empty: ${path}`);
    }
  }
}

function hashSurface() {
  const hash = createHash('sha256');
  for (const path of collectSurfaceFiles()) {
    const rel = relative(ROOT, path);
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function collectSurfaceFiles() {
  const result = [];
  for (const relPath of SURFACE_PATHS) {
    const fullPath = join(ROOT, relPath);
    if (!existsSync(fullPath)) {
      continue;
    }
    collectFiles(fullPath, result);
  }
  return result.sort();
}

function collectFiles(path, result) {
  const stat = statSync(path);
  if (stat.isFile()) {
    result.push(path);
    return;
  }
  if (!stat.isDirectory()) {
    return;
  }
  for (const entry of readdirSync(path)) {
    if (entry === '__pycache__' || entry === 'node_modules') {
      continue;
    }
    collectFiles(join(path, entry), result);
  }
}

function findBrowserExecutable() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }
  for (const command of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
    const result = spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
    if (result.status === 0) {
      const path = result.stdout.trim();
      if (path) {
        return path;
      }
    }
  }
  return null;
}

async function checkDownstream(browser, downstream) {
  const repo = join(PARENT, downstream.name);
  const port = await reservePort();
  const server = startServer(repo, downstream.name, port);
  try {
    await waitForServer(port, downstream.name, server);
    await verifyPage(browser, downstream, `http://127.0.0.1:${port}/`);
    console.log(`ok: ${downstream.name}`);
  } finally {
    await stopServer(server);
  }
}

function startServer(repo, app, port) {
  const child = spawn(
    'uv',
    ['run', 'python', join(ROOT, 'scripts', 'downstream_server.py'), '--app', app, '--port', String(port)],
    {
      cwd: repo,
      env: {
        ...process.env,
        HANDBOOK_DB_PATH: join(PARENT, 'japan_company_handbook', 'data', 'stock_performance.db'),
        STOCK_DB_VAR_DIR: join(PARENT, 'stock_db', 'var'),
        STOCKS_DB_PATH: join(PARENT, 'stock_db', 'var', 'db', 'stocks.db'),
        STOCK_WEB_UI_YAZI_BASE_DIR: join(PARENT, 'japan_company_handbook', 'data'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.output = '';
  child.stdout.on('data', (chunk) => {
    child.output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    child.output += chunk.toString();
  });
  return child;
}

async function verifyPage(browser, downstream, url) {
  const errors = [];
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') {
      if (message.text().startsWith('Failed to load resource:')) {
        return;
      }
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('response', (response) => {
    if (response.status() < 400) {
      return;
    }
    const url = response.url();
    if (url.endsWith('/favicon.ico')) {
      return;
    }
    errors.push(`HTTP ${response.status()} ${url}`);
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(
      () => {
        const status = document.querySelector('#statusMessage')?.textContent || '';
        const rows = Array.from(document.querySelectorAll('#tbody tr'));
        const bodyText = document.body.textContent || '';
        return rows.length > 0
          && !status.includes('読み込み中')
          && !bodyText.includes('読み込めませんでした')
          && !bodyText.includes('該当する銘柄はありません');
      },
      { timeout: 180_000 },
    );

    const headerText = await page.locator('thead').innerText({ timeout: 10_000 });
    for (const header of downstream.headers) {
      if (!headerText.includes(header)) {
        throw new Error(`${downstream.name}: missing header ${header}; headers were: ${headerText}`);
      }
    }

    if (downstream.name === 'invest_like_legends') {
      await page.locator('[data-tab-key="hikari"]').click({ timeout: 10_000 });
      await page.waitForFunction(
        () => (document.querySelector('#tbody')?.textContent || '').includes('億'),
        { timeout: 30_000 },
      );
    }

    const bodyText = await page.locator('#tbody').innerText({ timeout: 10_000 });
    if (downstream.bodyPattern && !downstream.bodyPattern.test(bodyText)) {
      throw new Error(`${downstream.name}: body did not match ${downstream.bodyPattern}; body was: ${bodyText}`);
    }
    if (errors.length > 0) {
      throw new Error(`${downstream.name}: browser errors:\n${errors.join('\n')}`);
    }
  } finally {
    await page.close();
  }
}

async function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolvePort(port));
    });
  });
}

async function waitForServer(port, name, child) {
  const deadline = Date.now() + 240_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${name}: server exited before becoming ready:\n${child.output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`${name}: server did not become ready on port ${port}: ${lastError}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  const exited = await waitForExit(child, 5_000);
  if (!exited) {
    child.kill('SIGKILL');
    await waitForExit(child, 5_000);
  }
}

async function waitForExit(child, timeoutMs) {
  return new Promise((resolveExit) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveExit(true);
      return;
    }
    const timeout = setTimeout(() => resolveExit(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveExit(true);
    });
  });
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
