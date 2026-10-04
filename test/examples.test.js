import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLEAN, EXPECTED, MESSY, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');

test('examples: the messy map fails with the report that is saved in examples/output', async () => {
  const r = await run(MESSY);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('messy.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean map passes with the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /findings: 0\n/);
  assert.equal((await run(['examples/clean/integration-map.json'])).code, 0, 'with the built-in configuration too');
});

test('examples: --explain, JSON, the GitHub commands, the matrix and the defaults are the reports that are saved', async () => {
  assert.equal((await run([...MESSY, '--explain'])).out, await saved('messy-explain.txt'));
  assert.equal((await run([...MESSY, '--json', '--explain'])).out, await saved('messy.json'));
  assert.equal((await run([...MESSY, '--format', 'github'])).out, await saved('messy-github.txt'));
  assert.equal((await run([...MESSY, '--matrix'])).out, await saved('messy-matrix.txt'));
  assert.equal((await run(['--print-defaults'])).out, await saved('defaults.json'));
});

test('examples: the rules that fire on the messy map, each on the line built for it', async () => {
  const report = JSON.parse((await run([...MESSY, '--json'])).out);
  const byRule = {};
  for (const f of report.findings) (byRule[f.rule] ??= []).push(f.line);
  for (const v of Object.values(byRule)) v.sort((a, b) => a - b);
  const lines = (await readFile(resolve(root, 'examples/messy/integration-map.yaml'), 'utf8')).split('\n');
  // The line that holds needle, at or after the first line that holds after.
  const line = (needle, after = '') => {
    const from = after ? lines.findIndex((l) => l.includes(after)) : 0;
    return lines.findIndex((l, i) => i >= from && l.includes(needle)) + 1;
  };
  assert.deepEqual(byRule, {
    'conflicting-owner': [line('owns: true', 'legacy-crm:'), line('owns: [listPrice')],
    'missing-owner': [line('product:', '  erp:'), line('order: [number, total, shippingAddress]')],
    'write-back': [line('- id: credit-sync'), line('- id: email-shop-to-crm'), line('- id: order-erp-to-wms')],
    'unknown-reference': [line('- id: stock-wms-to-shop'), line('- id: invoice-erp-to-billing')],
    'system-without-owner': [line('legacy-crm:'), line('wms:')],
    'unfed-copy': [line('product: [sku', 'wms:'), line('order: [number, shippingAddress]')],
    'circular-sync': [line('- id: credit-sync'), line('- id: email-shop-to-crm')]
  });
});

test('examples: the same maps written with CRLF line ends give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'system-of-record-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    for (const sub of ['examples/messy', 'examples/clean']) {
      for (const f of await readdir(resolve(dir, sub))) {
        const text = (await readFile(resolve(dir, sub, f), 'utf8')).split('\r\n').join('\n');
        await writeFile(resolve(dir, sub, f), text.split('\n').join('\r\n'));
      }
    }
    assert.equal((await run([...MESSY, '--explain'], dir)).out, await saved('messy-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
