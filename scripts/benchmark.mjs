import fs from 'node:fs';
import {METHODS,makeScenarios,runEpisode,aggregate} from '../dist/engine.js';
const n=Number(process.argv[2]??100),seed=Number(process.argv[3]??2026),suite=process.argv[4]??'uniform';
if(!Number.isInteger(n)||n<1||n>10000||!['uniform','mismatch','shift'].includes(suite))throw new Error('usage: node scripts/benchmark.mjs [n 1..10000] [seed] [uniform|mismatch|shift]');
const scenarios=makeScenarios(n,seed,suite),episodes={},summary={};
for(const method of Object.keys(METHODS)){
 const runs=scenarios.map(c=>runEpisode(method,c));summary[method]=aggregate(runs);episodes[method]=runs.map(r=>({config:r.config,metrics:r.metrics}));
}
fs.mkdirSync('results',{recursive:true});
const result={schema:'awm-benchmark-v1',engine:'numerical',n,seed,suite,scenarios,summary,episodes};
fs.writeFileSync('results/browser-benchmark.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));

