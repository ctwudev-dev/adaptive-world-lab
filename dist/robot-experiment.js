/** Shared paired experiment definitions for browser and contact tests. */
import {Random,scenario,METHODS,runEpisode,summarizeEpisodes} from "./robot-engine.js";
export function makeCases(n=60,seed=2048,suite='unseen') {
  if(!Number.isInteger(n)||n<1||n>500)throw Error('Use 1 to 500 cases.');
  if(!['unseen','shift','close'].includes(suite))throw Error('Unknown test set.');
  const rng=new Random(seed);
  return Array.from({length:n},(_,i)=>{
    const c=scenario('unfamiliar',{mu:.12+.4*rng.uniform(),mass:.45+.9*rng.uniform(),
      seed:(seed+i*7919)>>>0,target:[.22+.32*rng.uniform(),-.15+.48*rng.uniform()]});
    if(suite==='shift'){c.shiftMu=.14+.4*rng.uniform();c.shiftAfter=1;}
    if(suite==='close'){c.priorMu=c.mu;c.priorMass=c.mass;c.priorMuSd=.018;c.priorMassSd=.045;}
    return c;
  });
}
export function pairedSummary(episodes) {
  const summary=Object.fromEntries(METHODS.map(m=>[m,summarizeEpisodes(episodes[m])]));
  const comparisons={};
  for(const [a,b]of [['passive','fixed'],['active','passive']]) {
    const differences=episodes[a].map((e,i)=>({success:Number(e.metrics.success)-Number(episodes[b][i].metrics.success),
      actions:e.metrics.actions-episodes[b][i].metrics.actions,time:e.metrics.time-episodes[b][i].metrics.time}));
    comparisons[a+'Minus'+b[0].toUpperCase()+b.slice(1)]={
      successDelta:differences.reduce((s,x)=>s+x.success,0)/differences.length,
      actionDelta:differences.reduce((s,x)=>s+x.actions,0)/differences.length,
      timeDelta:differences.reduce((s,x)=>s+x.time,0)/differences.length,
      aOnlySuccess:differences.filter(x=>x.success===1).length,bOnlySuccess:differences.filter(x=>x.success===-1).length};
  }
  return {summary,comparisons};
}
export function benchmark(n=60,seed=2048,suite='unseen',progress=()=>{}) {
  const cases=makeCases(n,seed,suite),episodes=Object.fromEntries(METHODS.map(m=>[m,[]]));
  cases.forEach((c,i)=>{for(const method of METHODS)episodes[method].push(runEpisode(c,method));progress(i+1,n);});
  const compact=Object.fromEntries(METHODS.map(m=>[m,episodes[m].map(e=>({config:e.config,metrics:e.metrics}))]));
  return {schema:'robot-physics-benchmark-v1',engine:'numerical-contact-2d',suite,n,seed,cases,
    ...pairedSummary(episodes),episodes:compact};
}
