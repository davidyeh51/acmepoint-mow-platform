import { readFile } from 'node:fs/promises';
import { runVocRegressionTests } from './voc-regression-suite.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const [html, webhook, schema, migration] = await Promise.all([
  read('index.html'),
  read('supabase/functions/line-webhook/index.ts'),
  read('supabase-schema.sql'),
  read('supabase/migrations/20261021000100_add_voc_confirmation.sql')
]);
const results = await runVocRegressionTests({ html, webhook, schema, migration });
for (const result of results) {
  console.log((result.passed ? 'PASS' : 'FAIL') + ' ' + result.name);
  if (!result.passed) console.error('  ' + result.error);
}
const failures = results.filter(result => !result.passed);
console.log(results.length - failures.length + '/' + results.length + ' checks passed');
if (failures.length) process.exitCode = 1;
