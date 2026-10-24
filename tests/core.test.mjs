import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,GRID,METHODS,createWorld,createController,runEpisode,distance,priorFor,beliefStats,informationGain,makeScenarios,aggregate,validateConfig} from '../dist/engine.js';

test('numerical plant solves a separately integrated physical model',()=>{
 for(const mu of [.08,.16,.44,.8])for(const v of [-2.3,-.7,.7,2.3]){
  const world=createWorld({...DEFAULTS,mu,noise:0,start:1.2});world.observe();
  const r=world.execute(v);
  assert.ok(Math.abs(r.evaluation.x-(1.2+distance(v,mu)))<1e-10);
 }
});
test('hidden physical parameters cannot influence the initial decision',()=>{
 const a=createController('active',{...DEFAULTS,mu:.08,drag:0}).decide(.38);
 const b=createController('active',{...DEFAULTS,mu:.8,drag:2}).decide(.38);
 assert.deepEqual(a,b);
});
test('bayesian observations reduce uncertainty without truth access',()=>{
 const c={...DEFAULTS,mu:.24,noise:0},world=createWorld(c),agent=createController('passive',c);
 const prior=beliefStats(agent.belief());world.observe();agent.learn(world.execute(1.1).observation);
 const posterior=beliefStats(agent.belief());
 assert.ok(Math.abs(posterior.mean-.24)<.01);assert.ok(posterior.sd<prior.sd/3);
 assert.ok(Math.abs(agent.belief().reduce((a,b)=>a+b)-1)<1e-12);
});
test('information gain is positive, bounded, and discriminates actions',()=>{
 const w=priorFor(DEFAULTS);assert.ok(informationGain(.9,w,DEFAULTS)>informationGain(.3,w,DEFAULTS));
 for(const v of [.3,.6,1.05])assert.ok(informationGain(v,w,DEFAULTS)<=beliefStats(w).entropy+.01);
});
test('fixed point belief is normalized even between grid points',()=>{
 const c=createController('fixed',{...DEFAULTS,prior:.4445});
 assert.equal(c.belief().reduce((a,b)=>a+b),1);
});
test('all strategies are repeatable and account for probe costs',()=>{
 for(const m of Object.keys(METHODS)){
  const r=runEpisode(m);assert.deepEqual(r,runEpisode(m));
  assert.ok(r.metrics.actions<=6);assert.ok(r.metrics.time>=r.metrics.actions*.35);
  assert.equal(r.metrics.success,!r.metrics.boundary&&r.metrics.error<=DEFAULTS.tolerance);
  assert.equal(r.metrics.probes,r.events.filter(e=>e.kind==='probe').length);
 }
});
test('unknown friction can be learned, and matched fixed models can also win',()=>{
 assert.ok(runEpisode('active',{mu:.1}).metrics.success);
 assert.ok(runEpisode('fixed',{mu:.44}).metrics.success);
 const p=runEpisode('passive',{mu:.16}),a=runEpisode('active',{mu:.16});
 assert.ok(p.metrics.success&&a.metrics.success);
 assert.ok(a.metrics.actions>p.metrics.actions);
});
test('matched benchmark scenarios, aggregate rates and confidence bounds',()=>{
 const cs=makeScenarios(12,2026);assert.deepEqual(cs,makeScenarios(12,2026));
 const result=aggregate(cs.map(c=>runEpisode('active',c)));
 assert.equal(result.n,12);assert.ok(result.successCI[0]<=result.successRate);assert.ok(result.successCI[1]+1e-12>=result.successRate);
});
test('invalid configurations are rejected',()=>{
 for(const c of [{mu:0},{noise:-1},{seed:-1},{shiftAfter:-1},{mu:NaN},{maxActions:0}])assert.throws(()=>validateConfig({...DEFAULTS,...c}));
});

