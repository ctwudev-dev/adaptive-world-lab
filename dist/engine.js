/** Reference browser implementation. No dependency, no hidden parameter in controller API. */
export const G=9.81, GRID=Array.from({length:81},(_,i)=>.08+i*.009);
export const METHODS={
  fixed:{label:'Fixed model',en:'Fixed model',color:'#91a2bd',short:'FIXED'},
  passive:{label:'Passive adaptation',en:'Passive adaptation',color:'#70a9ff',short:'PASSIVE'},
  active:{label:'Active adaptation',en:'Active adaptation',color:'#ffb068',short:'ACTIVE'},
  robust:{label:'Robust planning',en:'Robust planning',color:'#72d4bd',short:'ROBUST'}
};
export const DEFAULTS=Object.freeze({mu:.10,prior:.44,priorSd:.16,noise:.003,drag:0,shiftMu:null,shiftAfter:2,start:.38,target:1.65,tolerance:.06,lo:.08,hi:2.32,maxActions:6,maxSpeed:2.3,seed:42});
const sum=a=>a.reduce((s,x)=>s+x,0);
export function rng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function normal(r){return Math.sqrt(-2*Math.log(Math.max(1e-12,r())))*Math.cos(2*Math.PI*r());}
export function normalize(a){const z=sum(a);return z>0&&Number.isFinite(z)?a.map(v=>v/z):a.map(()=>1/a.length);}
export function priorFor(c){return normalize(GRID.map(mu=>Math.exp(-.5*((mu-c.prior)/c.priorSd)**2)));}
export function quantile(w,q){let p=0;for(let i=0;i<w.length;i++){p+=w[i];if(p>=q)return GRID[i];}return GRID.at(-1);}
export function beliefStats(w){const mean=sum(w.map((p,i)=>p*GRID[i]));return{mean,sd:Math.sqrt(sum(w.map((p,i)=>p*(GRID[i]-mean)**2))),low:quantile(w,.025),high:quantile(w,.975),entropy:-sum(w.map(p=>p>0?p*Math.log(p):0))};}
export const distance=(u,mu)=>u*Math.abs(u)/(2*mu*G);
export const likelihoodSd=(d,c)=>Math.sqrt(2*c.noise**2+.003**2+(.025*Math.abs(d))**2);
export function predict(x,u,w,c){const ends=GRID.map(mu=>x+distance(u,mu)),mean=sum(w.map((p,i)=>p*ends[i]));return{mean,low:weightedQuantile(ends,w,.025),high:weightedQuantile(ends,w,.975),risk:sum(w.map((p,i)=>(ends[i]<c.lo||ends[i]>c.hi)?p:0)),sd:Math.sqrt(sum(w.map((p,i)=>p*(ends[i]-mean)**2)))};}
function weightedQuantile(v,w,q){const a=v.map((x,i)=>[x,w[i]]).sort((a,b)=>a[0]-b[0]);let p=0;for(const[x,z]of a){p+=z;if(p>=q)return x;}return a.at(-1)[0];}
/** E[I(mu; displacement)] by quadrature over a predictive observation grid (nats). */
export function informationGain(u,w,c){
  const d=GRID.map(mu=>distance(u,mu)),s=d.map(x=>likelihoodSd(x,c));
  let low=Infinity,high=-Infinity;
  for(let i=0;i<w.length;i++)if(w[i]>.0001){low=Math.min(low,d[i]-4*s[i]);high=Math.max(high,d[i]+4*s[i]);}
  const n=96,dy=(high-low)/n;let info=0;
  for(let j=0;j<n;j++){
    const y=low+(j+.5)*dy;
    const pdf=d.map((m,i)=>Math.exp(-.5*((y-m)/s[i])**2)/(s[i]*Math.sqrt(2*Math.PI)));
    const mix=sum(pdf.map((v,i)=>v*w[i]));if(mix<1e-200)continue;
    for(let i=0;i<w.length;i++)if(pdf[i]>1e-200)info+=w[i]*pdf[i]*Math.log(pdf[i]/mix)*dy;
  }
  return Math.max(0,info);
}
export function updateBelief(w,obs,c){
  const d=obs.end-obs.start,means=GRID.map(mu=>distance(obs.velocity,mu));
  const pred=sum(means.map((m,i)=>m*w[i]));
  const variance=sum(means.map((m,i)=>w[i]*((m-pred)**2+likelihoodSd(m,c)**2)));
  const innovation=Math.abs(d-pred)/Math.sqrt(variance);
  const reset=innovation>4,base=reset?priorFor(c):w;
  const logs=means.map((m,i)=>Math.log(Math.max(base[i],1e-300))-.5*((d-m)/likelihoodSd(m,c))**2-Math.log(likelihoodSd(m,c)));
  const max=Math.max(...logs),post=normalize(logs.map(l=>Math.exp(l-max)));
  // Small fixed hazard prevents permanent collapse after an unannounced surface change.
  const p0=priorFor(c),next=post.map((p,i)=>.99*p+.01*p0[i]);
  return{weights:next,innovation,reset};
}
function planTask(x,w,c,mode){
  const dir=Math.sign(c.target-x)||1;let best=null;
  for(let i=0;i<64;i++){
    const u=dir*(.08+(c.maxSpeed-.08)*i/63);
    const ends=GRID.map(mu=>x+distance(u,mu));
    let loss=0;
    if(mode==='fixed'){
      const end=x+distance(u,c.prior);loss=(end-c.target)**2+((end<c.lo||end>c.hi)?25:0);
    }else if(mode==='robust'){
      // Minimax over the entire declared friction support; this belief never updates.
      const a=x+distance(u,GRID[0]),b=x+distance(u,GRID.at(-1));
      loss=Math.max((a-c.target)**2,(b-c.target)**2)+((Math.min(a,b)<c.lo||Math.max(a,b)>c.hi)?25:0);
    }else loss=sum(w.map((p,k)=>p*((ends[k]-c.target)**2+((ends[k]<c.lo||ends[k]>c.hi)?25:0))));
    loss+=.0008*u*u;
    if(!best||loss<best.loss)best={velocity:u,kind:'task',loss};
  }
  return best;
}
/** Controller sees only measured x, its own prior and previous sensor transitions. */
export function createController(method,config){
  if(!METHODS[method])throw new Error('Unknown method');
  const c={...config};delete c.mu;delete c.drag;delete c.shiftMu;delete c.shiftAfter;delete c.seed;
  const nearest=GRID.reduce((best,mu,i)=>Math.abs(mu-c.prior)<Math.abs(GRID[best]-c.prior)?i:best,0);
  let w=method==='fixed'?GRID.map((_,i)=>i===nearest?1:0):priorFor(c);
  return{
    decide(x){
      const task=planTask(x,w,c,method),stats=beliefStats(w);
      let action=task;
      if(method==='active'&&stats.sd>.055){
        let best=null;const dir=Math.sign(c.target-x)||1;
        for(const v of [.3,.45,.6,.75,.9,1.05]){
          const u=dir*v,p=predict(x,u,w,c);
          if(p.risk>.001||Math.abs(p.mean-x)>.55*Math.abs(c.target-x))continue;
          const info=informationGain(u,w,c),cost=3*Math.abs(p.mean-x)+.03*u*u,score=info-cost;
          if(!best||score>best.score)best={velocity:u,kind:'probe',info,score};
        }
        if(best&&best.score>.25)action=best;
      }
      let prediction;
      if(method==='fixed'){
        const end=x+distance(action.velocity,c.prior);prediction={mean:end,low:end,high:end,risk:end<c.lo||end>c.hi?1:0,sd:0};
      }else prediction=predict(x,action.velocity,w,c);
      return{...action,prediction,belief:[...w],stats};
    },
    learn(obs){if(method==='fixed'||method==='robust')return{reset:false,innovation:null};const r=updateBelief(w,obs,c);w=r.weights;return{reset:r.reset,innovation:r.innovation};},
    belief(){return[...w];}
  };
}
/** Independent numerical plant: trapezoidal integration, no analytic stopping-distance call. */
export function createWorld(config){
  const c={...DEFAULTS,...config},random=rng(c.seed);let x=c.start,index=0,measured=null;
  return{
    observe(){measured=x+c.noise*normal(random);return measured;},
    execute(velocity){
      if(!Number.isFinite(velocity)||Math.abs(velocity)>c.maxSpeed+1e-9)throw new Error('Unsafe action');
      const start=measured??x+c.noise*normal(random),mu=(c.shiftMu!==null&&index>=c.shiftAfter)?c.shiftMu:c.mu;
      let v=velocity,t=0;const trace=[{t:0,x,v}],dt=.002;
      for(let k=0;k<5000&&Math.abs(v)>1e-6;k++){
        const sign=Math.sign(v),a=mu*G+c.drag*v*v,h=Math.min(dt,Math.abs(v)/a),next=sign*Math.max(0,Math.abs(v)-a*h);
        x+=(v+next)*h/2;t+=h;v=next;if(k%8===0||v===0)trace.push({t,x,v});
      }
      const end=x+c.noise*normal(random);index++;measured=null;
      return{observation:{start,end,velocity,duration:t},evaluation:{x,mu,boundary:x<c.lo||x>c.hi,trace}};
    },
    evaluate(){return{x,mu:(c.shiftMu!==null&&index>=c.shiftAfter)?c.shiftMu:c.mu};}
  };
}
export function runEpisode(method,config={}){
  const c={...DEFAULTS,...config};validateConfig(c);
  // Whitelist: hidden ground truth never enters controller configuration.
  const publicConfig=Object.fromEntries(['prior','priorSd','noise','target','tolerance','lo','hi','maxActions','maxSpeed'].map(k=>[k,c[k]]));
  const controller=createController(method,publicConfig),world=createWorld(c),events=[];
  let boundary=false,elapsed=0,path=0,energy=0,success=false;
  for(let k=0;k<c.maxActions;k++){
    const measured=world.observe();if(Math.abs(measured-c.target)<=c.tolerance)break;
    const action=controller.decide(measured),result=world.execute(action.velocity),learning=controller.learn(result.observation);
    const actual=result.evaluation;elapsed+=result.observation.duration+.35;energy+=.5*action.velocity**2;
    const trace=actual.trace;path+=Math.abs(trace.at(-1).x-trace[0].x);
    events.push({index:k+1,...action,observation:result.observation,...learning,posterior:controller.belief(),actual});
    if(actual.boundary){boundary=true;break;}
  }
  const end=world.evaluate();success=!boundary&&Math.abs(end.x-c.target)<=c.tolerance;
  const metrics={success,boundary,actions:events.length,probes:events.filter(e=>e.kind==='probe').length,error:Math.abs(end.x-c.target),time:elapsed,energy,path,muError:Math.abs(beliefStats(controller.belief()).mean-end.mu),predictionRmse:events.length?Math.sqrt(sum(events.map(e=>(e.prediction.mean-e.actual.x)**2))/events.length):0};
  return{schema:'awm-episode-v1',engine:'numerical-1d',method,config:c,events,metrics,posterior:controller.belief()};
}
export function validateConfig(c){
  for(const k of ['mu','prior','priorSd','noise','drag','start','target','tolerance','lo','hi','maxActions','maxSpeed','seed'])if(!Number.isFinite(c[k]))throw new Error(`Invalid ${k}`);
  if(c.mu<.08||c.mu>.8||c.prior<.08||c.prior>.8||c.priorSd<=0||c.noise<0||c.drag<0||c.lo>=c.hi||c.start<c.lo||c.start>c.hi||c.target<c.lo||c.target>c.hi||c.tolerance<=0||!Number.isInteger(c.maxActions)||c.maxActions<1||c.maxActions>20||c.maxSpeed<.08||c.maxSpeed>4)throw new Error('Configuration out of range');
  if(c.shiftMu!==null&&(!Number.isFinite(c.shiftMu)||c.shiftMu<.08||c.shiftMu>.8))throw new Error('Invalid shift friction');
  if(!Number.isInteger(c.shiftAfter)||c.shiftAfter<0||!Number.isInteger(c.seed)||c.seed<0||c.seed>4294967295)throw new Error('Invalid change point or seed');
}
export function wilson(k,n){if(!n)return[0,0];const z=1.96,p=k/n,a=1+z*z/n,m=(p+z*z/(2*n))/a,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/a;return[Math.max(0,m-h),Math.min(1,m+h)];}
export function aggregate(episodes){const n=episodes.length,successes=episodes.filter(r=>r.metrics.success).length;const out={n,successes,successRate:successes/n,successCI:wilson(successes,n)};for(const k of ['actions','probes','error','time','energy','path','muError','predictionRmse'])out[k]=sum(episodes.map(r=>r.metrics[k]))/n;out.boundaryRate=episodes.filter(r=>r.metrics.boundary).length/n;return out;}
export function makeScenarios(n,seed=2026,suite='uniform'){
  const r=rng(seed);return Array.from({length:n},(_,i)=>{
    const mu=.1+.65*r(),start=.26+.24*r(),target=1.55+.25*r(),noise=.002+.004*r();
    return{...DEFAULTS,mu,start,target,noise,seed:(seed+i*7919)>>>0,drag:suite==='mismatch'?.7:0,shiftMu:suite==='shift'?.1+.65*r():null,shiftAfter:1};
  });
}
