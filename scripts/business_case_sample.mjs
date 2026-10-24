/** Generate the sample from the same financial model used in the browser. */
import fs from 'node:fs';
import { CASE_DEFAULTS, exportBusinessCase } from '../dist/business-case.js';
fs.writeFileSync(new URL('../dist/business-case-sample.json', import.meta.url), JSON.stringify(exportBusinessCase(CASE_DEFAULTS), null, 2) + '\n');
console.log('Generated the illustrative business case from the shared model.');
