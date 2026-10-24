import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,GRID,METHODS,scenario,publicConfig,initialController,plan,updateController,
  predictPhysics,numericalPush,runEpisode,beliefStats,summarizeEpisodes} from '../dist/robot-engine.js';
import {makeCases,benchmark} from '../dist/robot-experiment.js';

test('controller allowlist excludes hidden physics and change timing',()=>{
  const a=initialController({...DEFAULTS,mu:.6,mass:1.5,shiftMu:.2,shiftAfter:1,privateModel:'hidden'},'active');
  const b=initialController({...DEFAULTS,mu:.1,mass:.4},'active');
  assert.deepEqual(a,b);assert.deepEqual(plan(a),plan(b));
  for(const key of ['mu','mass','shiftMu','shiftAfter','privateModel'])assert.equal(key in a.config,false);
});
test('unreachable target coordinates and invalid force commands are rejected',()=>{
  assert.throws(()=>publicConfig({target:[2,0]}));assert.throws(()=>publicConfig({seed:NaN}));
  assert.throws(()=>publicConfig({maxActions:2.5}));assert.throws(()=>initialController({},'unknown'));
  assert.throws(()=>numericalPush([0,0],{force:9,duration:.1,ux:1,uy:0},{mu:.3,mass:1},DEFAULTS,0));
});
test('sub-threshold motor force does not launch the object',()=>{
  const a={force:2,duration:.2,ux:1,uy:0},p=numericalPush([0,0],a,{mu:.5,mass:1},DEFAULTS,0);
  assert.deepEqual(p.position,[0,0]);assert.equal(p.trace.at(-1).speed,0);
});
test('higher mass and friction reduce travel at the same force',()=>{
  const a={force:6,duration:.15,ux:1,uy:0};
  const p=(mu,mass)=>numericalPush([0,0],a,{mu,mass},DEFAULTS,0).position[0];
  assert.ok(p(.2,.6)>p(.2,1.2));assert.ok(p(.2,.6)>p(.4,.6));
});
test('numerical contact and coast obey independent constant-acceleration checks',()=>{
  const a={force:5,duration:.2,ux:.6,uy:.8},p=numericalPush([0,0],a,{mu:.25,mass:.8},DEFAULTS,0);
  const acceleration=(5-.25*.8*9.81)/.86;
  const expected=.5*acceleration*.2**2+(acceleration*.2)**2/(2*.25*9.81);
  assert.ok(Math.abs(Math.hypot(...p.position)-expected)<1e-9);
  const coast=p.trace.filter(x=>x.phase==='coast');
  for(let i=1;i<coast.length;i++)assert.ok(coast[i].speed<=coast[i-1].speed+1e-9);
  assert.ok(Math.abs(p.position[0]/p.position[1]-.75)<1e-9);
});
test('observing push and coast identifies both unknown parameters within the grid resolution',()=>{
  const e=runEpisode(scenario('unfamiliar'),'passive'),s=beliefStats(e.posterior);
  assert.ok(Math.abs(s.mu-.38)<.045);assert.ok(Math.abs(s.mass-1.15)<.13);
  assert.equal(e.metrics.success,true);assert.ok(e.metrics.actions<=7);
  const before=beliefStats(e.events[0].belief);assert.ok(s.entropy<before.entropy);
});
test('fixed strategy keeps the starting belief while adaptive strategies update',()=>{
  const f=runEpisode(scenario('unfamiliar'),'fixed'),p=runEpisode(scenario('unfamiliar'),'passive');
  assert.deepEqual(f.posterior,f.events[0].belief);
  assert.notDeepEqual(p.posterior,p.events[0].belief);
});
test('zero information weight is an exact ablation of active action scoring',()=>{
  const c=scenario('slippery',{informationWeight:0}),a=runEpisode(c,'active'),p=runEpisode(c,'passive');
  assert.deepEqual(a.events.map(x=>x.action),p.events.map(x=>x.action));assert.deepEqual(a.metrics,p.metrics);
});
test('friction change is hidden until encountered and can reopen the physics range',()=>{
  const e=runEpisode(scenario('change'),'active');
  assert.ok(e.events.length>2);assert.deepEqual(e.events.slice(0,3).map(x=>x.actual.mu),[.3,.3,.5]);
  assert.ok(e.metrics.resets>=1);assert.equal(e.metrics.success,true);
});
test('every learning move consumes time and an action',()=>{
  const e=runEpisode(scenario('change'),'active');
  assert.ok(e.metrics.probes>0);assert.equal(e.metrics.actions,e.events.length);
  assert.equal(e.metrics.probes,e.events.filter(x=>x.kind==='probe').length);
  assert.ok(e.metrics.time>=e.metrics.actions*DEFAULTS.setupTime);
  assert.equal(e.metrics.time,e.events.reduce((s,x)=>s+x.actual.time+e.config.setupTime,0));
});
test('seeded episodes are repeatable and use a common noise stream across strategies',()=>{
  const c=scenario('slippery'),a=runEpisode(c,'active'),b=runEpisode(c,'active'),f=runEpisode(c,'fixed');
  assert.deepEqual(a,b);assert.deepEqual(a.events[0].observation.start,f.events[0].observation.start);
});
test('invalid sensor readings fail closed; zero measurement noise remains finite',()=>{
  const s=initialController({}),a=plan(s).action;
  assert.throws(()=>updateController(s,a,{start:[0,0],pulse:[NaN,0],end:[1,0]}));
  assert.throws(()=>plan({...s,weights:[1]}));
  const e=runEpisode(scenario('unfamiliar',{noise:0}),'active');
  assert.ok(e.posterior.every(Number.isFinite));assert.ok(Math.abs(e.posterior.reduce((a,b)=>a+b,0)-1)<1e-10);
});
test('paired tests retain failures, all strategies, and valid success intervals',()=>{
  const b=benchmark(6,2048,'unseen');assert.equal(b.cases.length,6);
  for(const m of METHODS){assert.equal(b.episodes[m].length,6);assert.equal(b.summary[m].n,6);
    assert.ok(b.summary[m].successLow<=b.summary[m].successRate);
    assert.ok(b.summary[m].successHigh>=b.summary[m].successRate);
    b.episodes[m].forEach((e,i)=>{assert.deepEqual(e.config.target,b.cases[i].target);assert.ok(e.metrics.actions<=7);});}
  assert.ok(b.summary.fixed.successes<6);
});
test('case generator is deterministic and rejects an unknown test set',()=>{
  assert.deepEqual(makeCases(5,42,'shift'),makeCases(5,42,'shift'));
  assert.ok(makeCases(5,42,'shift').every(c=>c.shiftAfter===1));
  assert.throws(()=>makeCases(0));assert.throws(()=>makeCases(5,42,'made-up'));
  const close=makeCases(5,42,'close');assert.ok(close.every(c=>c.mu===c.priorMu&&c.mass===c.priorMass));
});
test('force-duration observations distinguish mass from friction when stopping distance alone is ambiguous',()=>{
  const a={force:6,duration:.15,ux:1,uy:0};
  const one=predictPhysics({mu:.2,mass:1.2},a);
  let best=null;
  for(const g of GRID.filter(x=>Math.abs(x.mass-1.2)>.25)){
    const v=predictPhysics(g,a),error=Math.abs(v.end-one.end);
    if(!best||error<best.error)best={g,v,error};
  }
  assert.ok(best.error<.004);assert.ok(Math.abs(best.v.push-one.push)>.008);
});
