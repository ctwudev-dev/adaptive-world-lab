/** Task-specific physics learning. SI units. No framework or hidden-state input. */
export const ROBOT_VERSION = '2.0.0';
export const G = 9.81;
export const PUSHER_MASS = 0.06;
export const OBJECT_RADIUS = 0.055;
export const METHODS = ['fixed', 'passive', 'active'];
export const GRID = Array.from({length: 19}, (_, i) => 0.08 + i * 0.03)
  .flatMap(mu => Array.from({length: 13}, (_, j) => ({mu, mass: 0.35 + j * 0.1})));
export const DEFAULTS = Object.freeze({
  start: [-0.52, -0.22], target: [0.42, 0.2], bounds: [-1, 1, -0.6, 0.6],
  noise: 0.0025, maxActions: 7, tolerance: 0.055, setupTime: 0.6,
  priorMu: 0.26, priorMass: 0.75, priorMuSd: 0.09, priorMassSd: 0.22,
  informationWeight: 0.006, seed: 2026,
});
export const PRESETS = Object.freeze({
  unfamiliar: {label: 'An unfamiliar object', mu: 0.38, mass: 1.15,
    note: 'The object is heavier and the surface has more friction than the starting model expects.'},
  slippery: {label: 'A slippery surface', mu: 0.14, mass: 0.65,
    note: 'A gentle push may travel farther than expected. Watch the table limit.'},
  change: {label: 'The surface changes', mu: 0.3, mass: 1.1, shiftMu: 0.5, shiftAfter: 2,
    note: 'Friction changes after two pushes. The controller must notice from motion alone.'},
  known: {label: 'The model starts close', mu: 0.26, mass: 0.75,
    priorMuSd: 0.018, priorMassSd: 0.045,
    note: 'A close starting model leaves less reason to spend a move on learning.'},
});
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export {dist};
const finite = x => typeof x === 'number' && Number.isFinite(x);
const clone = x => JSON.parse(JSON.stringify(x));

/** Explicit allowlist: true friction, mass and change timing never enter a controller. */
export function publicConfig(input = {}) {
  const c = {};
  for (const k of Object.keys(DEFAULTS)) c[k] = clone(input[k] ?? DEFAULTS[k]);
  for (const key of ['start', 'target']) {
    if (!Array.isArray(c[key]) || c[key].length !== 2 || !c[key].every(finite)) throw Error('Use two finite coordinates.');
  }
  if (!Array.isArray(c.bounds) || c.bounds.length !== 4 || !c.bounds.every(finite)
    || c.bounds[0] >= c.bounds[1] || c.bounds[2] >= c.bounds[3]
    || c.bounds.some(x => Math.abs(x) > 5)) throw Error('Invalid table limits.');
  if ([...c.start, ...c.target].some(x => Math.abs(x) > 5)
    || !inside(c.start, c) || !inside(c.target, c)) throw Error('Start and target must be inside the table limits.');
  const ranges = {noise:[0,0.02], maxActions:[1,12], tolerance:[0.01,0.15], setupTime:[0,5],
    priorMu:[0.08,0.62], priorMass:[0.35,1.55], priorMuSd:[0.005,0.3], priorMassSd:[0.01,0.8],
    informationWeight:[0,0.03], seed:[0,4294967295]};
  for (const [k, [lo,hi]] of Object.entries(ranges)) {
    if (!finite(c[k]) || c[k] < lo || c[k] > hi) throw Error('Invalid '+k+'.');
  }
  if (!Number.isInteger(c.maxActions) || !Number.isInteger(c.seed)) throw Error('Use a whole number for the budget and seed.');
  return c;
}
export function inside(p, c) {
  return p[0] >= c.bounds[0] && p[0] <= c.bounds[1] && p[1] >= c.bounds[2] && p[1] <= c.bounds[3];
}
export function validateAction(a) {
  if (!a || ![a.force,a.duration,a.ux,a.uy].every(finite) || a.force < 1 || a.force > 8
    || a.duration < 0.025 || a.duration > 0.34 || Math.abs(Math.hypot(a.ux,a.uy)-1) > 1e-7) {
    throw Error('Invalid force pulse.');
  }
  return {force:a.force, duration:a.duration, ux:a.ux, uy:a.uy};
}
export function prior(c) {
  const p = GRID.map(({mu,mass}) => Math.exp(-0.5*((mu-c.priorMu)/c.priorMuSd)**2
    -0.5*((mass-c.priorMass)/c.priorMassSd)**2));
  const s = p.reduce((a,b)=>a+b,0);
  return p.map(x=>0.985*x/s+0.015/p.length);
}
function validWeights(p) {
  return Array.isArray(p) && p.length === GRID.length && p.every(x=>finite(x)&&x>=0)
    && Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-7;
}
export function beliefStats(p) {
  if (!validWeights(p)) throw Error('Invalid physics belief.');
  const mean = key => GRID.reduce((s,g,i)=>s+p[i]*g[key],0);
  const quantile = (key,q) => {
    const values = GRID.map((g,i)=>[g[key],p[i]]).sort((a,b)=>a[0]-b[0]);
    let s=0; for (const [v,w] of values) {s+=w;if(s>=q)return v;} return values.at(-1)[0];
  };
  return {mu:mean('mu'), mass:mean('mass'), muLow:quantile('mu',.05),muHigh:quantile('mu',.95),
    massLow:quantile('mass',.05),massHigh:quantile('mass',.95),
    entropy:-p.reduce((s,w)=>s+(w>0?w*Math.log(w):0),0)};
}

/** Ideal radial contact: motor force accelerates the object and a known light pusher. */
export function predictPhysics(params, action) {
  const a = Math.max(0, (action.force-params.mu*params.mass*G)/(params.mass+PUSHER_MASS));
  const push = 0.5*a*action.duration**2, velocity = a*action.duration;
  return {push, end:push+velocity**2/(2*params.mu*G),
    time:action.duration+velocity/(params.mu*G)};
}
function noiseMatrix(c, push, end) {
  // Shared start measurement gives positive covariance. Model error is explicit.
  const s=c.noise**2, ep=(0.0025+0.025*push)**2, ee=(0.004+0.035*end)**2;
  return {a:2*s+ep,b:s,d:2*s+ee};
}
function likelihoods(observation, action, c) {
  const obs = validateObservation(observation);
  const projected = p => (p[0]-obs.start[0])*action.ux+(p[1]-obs.start[1])*action.uy;
  const push=projected(obs.pulse),end=projected(obs.end);
  return GRID.map(g=>{
    const v=predictPhysics(g,action),r=noiseMatrix(c,v.push,v.end),det=r.a*r.d-r.b*r.b;
    const x=push-v.push,y=end-v.end;
    return -0.5*((r.d*x*x-2*r.b*x*y+r.a*y*y)/det+Math.log(det));
  });
}
export function validateObservation(o) {
  if (!o || ['start','pulse','end'].some(k=>!Array.isArray(o[k])||o[k].length!==2
    ||!o[k].every(x=>finite(x)&&Math.abs(x)<=20))) throw Error('Invalid position observations.');
  return {start:[...o.start],pulse:[...o.pulse],end:[...o.end]};
}
export function initialController(input, method='active') {
  const c=publicConfig(input);
  if (!METHODS.includes(method)) throw Error('Unknown strategy.');
  return {config:c,method,position:[...c.start],weights:prior(c),step:0,resets:0};
}
function validateState(s) {
  if (!s || !METHODS.includes(s.method) || !validWeights(s.weights)
    || !Number.isInteger(s.step) || s.step<0 || s.step>12
    || !Array.isArray(s.position) || s.position.length!==2 || !s.position.every(finite)) throw Error('Invalid controller state.');
}
export function updateController(state, action, observation) {
  validateState(state);action=validateAction(action);observation=validateObservation(observation);
  const c=publicConfig(state.config),next={...state,config:c,position:[...observation.end],step:state.step+1};
  if (state.method==='fixed') return {...next,weights:[...state.weights],reset:false};
  const prediction=summarize(state.weights,action,observation.start,c);
  const measured=(observation.end[0]-observation.start[0])*action.ux+(observation.end[1]-observation.start[1])*action.uy;
  const surprise=Math.abs(measured-prediction.distance)/Math.sqrt(prediction.variance+noiseMatrix(c,0,prediction.distance).d);
  const reset=surprise>4;
  // Reopen support on a large residual. This heuristic cannot detect every model error.
  const p=reset?state.weights.map((w,i)=>0.3*w+0.7/GRID.length):state.weights;
  const ll=likelihoods(observation,action,c),logs=p.map((w,i)=>Math.log(Math.max(w,1e-300))+ll[i]);
  const peak=Math.max(...logs),weights=logs.map(x=>Math.exp(x-peak)),sum=weights.reduce((a,b)=>a+b,0);
  return {...next,weights:weights.map(w=>w/sum),reset,resets:state.resets+Number(reset)};
}
function summarize(weights, action, start, c) {
  const outcomes=GRID.map(g=>predictPhysics(g,action));
  const mean=key=>outcomes.reduce((s,v,i)=>s+weights[i]*v[key],0);
  const push=mean('push'),end=mean('end'),time=mean('time');
  let sp=0,se=0,cov=0,risk=0,loss=0;
  outcomes.forEach((v,i)=>{
    const w=weights[i],p=[start[0]+action.ux*v.end,start[1]+action.uy*v.end];
    sp+=w*(v.push-push)**2;se+=w*(v.end-end)**2;cov+=w*(v.push-push)*(v.end-end);
    risk+=w*Number(!inside(p,c));loss+=w*dist(p,c.target)**2;
  });
  const r=noiseMatrix(c,push,end),det=r.a*r.d-r.b*r.b;
  const info=Math.max(0,0.5*Math.log(Math.max(1,((sp+r.a)*(se+r.d)-(cov+r.b)**2)/det)));
  const sorted=outcomes.map((v,i)=>[v.end,weights[i]]).sort((a,b)=>a[0]-b[0]);
  const q=n=>{let s=0;for(const [v,w]of sorted){s+=w;if(s>=n)return v;}return sorted.at(-1)[0];};
  return {end:[start[0]+action.ux*end,start[1]+action.uy*end],
    pulse:[start[0]+action.ux*push,start[1]+action.uy*push],distance:end,variance:se,
    low:q(.05),high:q(.95),time,info,risk,loss};
}
export function plan(state) {
  validateState(state);const c=publicConfig(state.config),start=state.position;
  if (state.step>=c.maxActions) throw Error('The move budget is used.');
  const length=dist(start,c.target),ux=length>1e-9?(c.target[0]-start[0])/length:1,uy=length>1e-9?(c.target[1]-start[1])/length:0;
  const stats=beliefStats(state.weights),candidates=[];
  for(const force of [2,3.5,5,6.5,8]) {
    const unit=predictPhysics(stats,{force,duration:1}).end;
    const ideal=unit>1e-12?Math.sqrt(length/unit):0.34;
    const durations=[.04,.07,.11,.16,.24,.34,...[.5,.75,1,1.2].map(k=>Math.max(.025,Math.min(.34,ideal*k)))];
    for (const duration of [...new Set(durations.map(x=>Number(x.toFixed(5))))]) {
      const action={force,duration,ux,uy},prediction=summarize(state.weights,action,start,c);
      const taskScore=prediction.loss+1.8*prediction.risk+0.0015*(prediction.time+c.setupTime);
      // A one-step information bonus, not an optimal dual-control solution.
      const bonus=state.method==='active'&&state.step<c.maxActions-1?c.informationWeight*prediction.info:0;
      candidates.push({action,prediction,taskScore,score:taskScore-bonus});
    }
  }
  const task=candidates.reduce((a,b)=>b.taskScore<a.taskScore?b:a);
  const chosen=candidates.reduce((a,b)=>b.score<a.score?b:a);
  const kind=chosen!==task?'probe':'task';
  return {...chosen,kind,candidateCount:candidates.length,
    alternatives:[...candidates].sort((a,b)=>a.score-b.score).slice(0,6)};
}

export class Random {
  constructor(seed) {this.state=seed>>>0;}
  uniform() {this.state=(this.state+0x6D2B79F5)>>>0;let t=this.state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
  normal() {return Math.sqrt(-2*Math.log(Math.max(1e-12,this.uniform())))*Math.cos(2*Math.PI*this.uniform());}
}
export function scenario(preset='unfamiliar',overrides={}) {
  if(!PRESETS[preset])throw Error('Unknown case.');
  const full={...clone(DEFAULTS),...clone(PRESETS[preset]),...clone(overrides)};
  publicConfig(full);
  for (const k of ['mu','mass']) if(!finite(full[k])||full[k]<(k==='mu'?.08:.35)||full[k]>(k==='mu'?.62:1.55))throw Error('Hidden physics is outside the supported range.');
  if(full.shiftMu!==undefined&&(!finite(full.shiftMu)||full.shiftMu<.08||full.shiftMu>.62
    ||!Number.isInteger(full.shiftAfter)||full.shiftAfter<0||full.shiftAfter>12))throw Error('Invalid surface change.');
  return full;
}
/** Independent time-stepping plant. Only the harness owns its true parameters. */
export function numericalPush(position, action, hidden, c, step) {
  action=validateAction(action);
  const mu=hidden.shiftMu!==undefined&&step>=hidden.shiftAfter?hidden.shiftMu:hidden.mu;
  const mass=hidden.mass,trace=[{t:0,x:position[0],y:position[1],speed:0,phase:'push'}];
  let x=position[0],y=position[1],v=0,t=0,pulse=null;
  for(let k=0;k<10000;k++) {
    const pushing=t<action.duration-1e-10;
    const h=pushing?Math.min(.001,action.duration-t):.001;
    const a=pushing?(action.force-mu*mass*G)/(mass+PUSHER_MASS):-mu*G;
    const nv=Math.max(0,v+a*h),dt=!pushing&&v>0&&nv===0?v/(mu*G):h;
    const d=(v+nv)*dt/2;x+=action.ux*d;y+=action.uy*d;t+=dt;v=nv;
    if(pushing&&t>=action.duration-1e-10)pulse=[x,y];
    if(k%15===0||!pushing&&v===0)trace.push({t,x,y,speed:v,phase:pushing?'push':'coast'});
    if(!pushing&&v===0)break;
  }
  if(!pulse)throw Error('Pulse did not finish.');
  if(t>=9.99)throw Error('The object did not settle.');
  return {pulse,position:[x,y],time:t,trace,mu,mass,engine:'numerical-contact-2d'};
}
export function runEpisode(input, method='active') {
  const hidden=scenario('unfamiliar',input),c=publicConfig(hidden),random=new Random(c.seed);
  const noise=p=>p.map(v=>v+c.noise*random.normal());
  let position=[...c.start],state=initialController(c,method),events=[];
  state.position=noise(position);
  while(state.step<c.maxActions&&inside(position,c)&&dist(position,c.target)>c.tolerance) {
    const decision=plan(state),belief=[...state.weights],start=[...state.position];
    const actual=numericalPush(position,decision.action,hidden,c,state.step);
    const observation={start,pulse:noise(actual.pulse),end:noise(actual.position)};
    state=updateController(state,decision.action,observation);position=actual.position;
    events.push({index:state.step,...decision,belief,posterior:[...state.weights],reset:state.reset,observation,actual});
  }
  return finishEpisode(c,method,events,state,position,'numerical-contact-2d');
}
export function finishEpisode(c,method,events,state,position,engine) {
  const errors=events.map(e=>dist(e.prediction.end,e.actual.position));
  return {schema:'robot-physics-episode-v1',engine,method,config:c,events,posterior:state.weights,
    metrics:{success:inside(position,c)&&dist(position,c.target)<=c.tolerance,boundary:!inside(position,c),
      error:dist(position,c.target),actions:events.length,probes:events.filter(e=>e.kind==='probe').length,
      time:events.reduce((s,e)=>s+e.actual.time+c.setupTime,0),predictionRmse:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/Math.max(1,errors.length)),
      resets:state.resets}};
}
export function summarizeEpisodes(episodes) {
  const n=episodes.length;if(!n)throw Error('No episodes to summarize.');
  const mean=k=>episodes.reduce((s,e)=>s+Number(e.metrics[k]),0)/n;
  const successes=episodes.filter(e=>e.metrics.success).length,p=successes/n,z=1.96,d=1+z*z/n;
  const center=(p+z*z/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  // Keep exact 0/1 endpoints inside the interval despite floating-point rounding.
  return {n,successes,successRate:p,successLow:Math.min(p,Math.max(0,center-half)),successHigh:Math.max(p,Math.min(1,center+half)),
    actions:mean('actions'),probes:mean('probes'),time:mean('time'),error:mean('error'),predictionRmse:mean('predictionRmse'),boundaries:mean('boundary')};
}
