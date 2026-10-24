/** Paired, seeded cases. Every strategy gets the same object and sensor-noise stream. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {benchmark} from '../dist/robot-experiment.js';
export {makeCases,pairedSummary,benchmark} from '../dist/robot-experiment.js';
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1]))) {
  const n=Number(process.argv[2]??60),seed=Number(process.argv[3]??2048);
  for(const suite of ['unseen','shift','close']) {
    const result=benchmark(n,seed,suite);
    result.provenance={description:'Generated numerical simulation; all cases and failures retained.',codeHashes:Object.fromEntries(
      ['dist/robot-engine.js','dist/robot-experiment.js','scripts/robot_benchmark.mjs'].map(p=>[p,
        crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+p,import.meta.url))).digest('hex')]))};
    fs.writeFileSync(new URL('../results/robot-numerical-'+suite+'.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
    console.log(suite,JSON.stringify(result.summary));
  }
}
