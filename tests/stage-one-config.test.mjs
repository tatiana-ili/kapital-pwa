import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('project uses official Next.js and exports an installable Android manifest', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const manifest = JSON.parse(
    await readFile(
      new URL('../public/manifest.webmanifest', import.meta.url),
      'utf8',
    ),
  );

  assert.match(packageJson.dependencies.next, /^16\./);
  assert.equal(packageJson.dependencies.vinext, undefined);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('service worker never caches navigations or API responses', async () => {
  const worker = await readFile(
    new URL('../public/sw.js', import.meta.url),
    'utf8',
  );

  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.doesNotMatch(worker, /const STATIC_ASSETS = \[\s*['"]\/['"]/);
});

test('every personal finance table has row-level security and an owner policy', async () => {
  const migration = await readFile(
    new URL(
      '../supabase/migrations/202609110001_initial_schema.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const tables = [
    'accounts',
    'import_profiles',
    'imports',
    'transactions',
    'category_rules',
    'balance_snapshots',
    'budgets',
    'goals',
    'subscriptions',
  ];

  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} enable row level security;`),
    );
    assert.match(
      migration,
      new RegExp(
        `on public\\.${table} for all using \\(user_id = auth\\.uid\\(\\)\\)`,
      ),
    );
  }
});
