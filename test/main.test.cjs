'use strict';
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const scenarios = require('./scenarios.cjs');
function load(globals) {
  const context = { ...globals, module: { exports: {} } };
  vm.runInNewContext(source, context, { filename: 'main.js', timeout: 1000 });
  return context.module.exports;
}
for (const [name, run] of scenarios) test(name, () => run(load));
