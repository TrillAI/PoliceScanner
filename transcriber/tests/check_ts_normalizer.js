/* global __dirname */
// Parity check: the TypeScript normalizer must produce the same output as the
// Python one for every case in normalize_corpus.json.
//
//   node transcriber/tests/check_ts_normalizer.js        (from the repo root)
//
// Run it after changing either normalizer, or the RADIO_FIXES table.
const fs = require('fs');
const path = require('path');
const ts = require(path.join(__dirname, '..', '..', 'node_modules', 'typescript'));

const root = path.join(__dirname, '..', '..');
const source = fs.readFileSync(path.join(root, 'services', 'transcriptNormalizer.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);

const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'normalize_corpus.json'), 'utf8'));
let failures = 0;
for (const { raw, normalized } of corpus) {
  const got = mod.exports.normalizeRadioTranscript(raw);
  if (got !== normalized) {
    failures += 1;
    console.log(`MISMATCH ${JSON.stringify(raw)}\n  python: ${JSON.stringify(normalized)}\n  ts:     ${JSON.stringify(got)}`);
  }
}
console.log(`${corpus.length - failures}/${corpus.length} cases match`);
process.exit(failures ? 1 : 0);
