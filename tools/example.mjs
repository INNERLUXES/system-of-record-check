// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// integration maps to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const MESSY = ['examples/messy/integration-map.yaml'];
export const CLEAN = ['examples/clean/integration-map.json', '--config', 'examples/config.json'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the messy map: the counts, one finding of every rule, and the result.
export const EXPECTED = [
  'input: examples/messy/integration-map.yaml (YAML; 5 systems, 4 entities, 17 fields, 9 flows)',
  'findings: 15 (9 error, 6 warning)',
  'the entity customer is claimed as owned by 2 systems, crm and legacy-crm',
  'product.listPrice is claimed as owned by 2 systems, erp and shop',
  'the entity product is held by 3 systems, erp, shop and wms, and none owns it',
  'order.shippingAddress is held by 2 systems, erp and wms, and none owns it',
  'the flow credit-sync (two-way) writes customer.creditLimit from crm into erp, which owns that field',
  'it is marked as an exception but gives no reason',
  'the flow order-erp-to-wms passes order.number from erp to wms, but shop owns that field',
  'the flow invoice-erp-to-billing names the target "billing", which is not a system of the map',
  'the target of stock-wms-to-shop, shop, does not hold product.stockLevel',
  'wms holds product.sku and product.name, owned by erp, and no flow from erp feeds them',
  'customer.email goes both ways between crm and shop',
  'the system legacy-crm has no team and no contact ("TBD" names no one)',
  'RESULT: FAIL - 9 errors (and 6 warnings)'
];
export const UNWANTED = ['RESULT: PASS', 'customer.accountNumber is claimed', 'legacy-crm holds'];

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const messy = await run(MESSY);
  process.stdout.write(messy.out);
  expect('messy map', messy, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean map', clean, 0, ['input: examples/clean/integration-map.json (JSON; 4 systems, 5 entities, 21 fields, 7 flows)', 'findings: 0', '1 approved exception', 'RESULT: PASS - no error'], ['  WARNING  ', '  ERROR  ', '  NOTICE  ', 'RESULT: FAIL']);

  // The clean map passes with the built-in configuration too, and the messy one fails harder with the configuration of
  // the example, which makes a copy with no feed and a loop errors.
  expect('clean, built-in configuration', await run(['examples/clean/integration-map.json']), 0, ['config: built-in defaults:', 'findings: 0'], []);
  expect('messy, example configuration', await run([...MESSY, '--config', 'examples/config.json']), 1, ['findings: 15 (13 error, 2 warning)', 'ERROR    unfed-copy', 'ERROR    circular-sync'], []);

  // Only the errors.
  expect('messy, errors only', await run([...MESSY, '--min-severity', 'error']), 1, ['findings: 9 (9 error); 6 below error not shown'], ['WARNING']);

  // The README shows the whole report of the messy map, the --explain lines of one finding, the GitHub annotations of
  // the first findings, the ownership matrix and the report of the clean map.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(messy.out)) problems.push('README: the sample output of the messy map differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean map differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/messy.txt'), messy.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...MESSY, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('unfed-copy') && l.includes('integration-map.yaml:60'));
  const sample = lines.slice(at, at + 6).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of the copy with no feed differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-explain.txt'), explain.out);
  const github = await run([...MESSY, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  for (const l of github.out.split('\n').filter((x) => x.includes('line=22,') || x.includes('line=33,'))) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-github.txt'), github.out);
  const json = await run([...MESSY, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/messy.json'), json.out);
  const matrix = await run([...MESSY, '--matrix']);
  if (matrix.code !== 1) problems.push(`matrix: exit code ${matrix.code}, expected 1`);
  if (!readme.includes(matrix.out)) problems.push('README: the ownership matrix differs from a real run');
  await writeFile(resolve(root, 'examples/output/messy-matrix.txt'), matrix.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
