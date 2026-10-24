import {METHODS,makeScenarios,runEpisode,aggregate} from './engine.js';
self.onmessage=({data:{n,seed,suite}})=>{
 try{
  const scenarios=makeScenarios(n,seed,suite),episodes={},summary={};let done=0;
  for(const method of Object.keys(METHODS)){
   const runs=[];
   for(const c of scenarios){
    const r=runEpisode(method,c);runs.push(r);done++;
    if(done%4===0)self.postMessage({type:'progress',done,value:done/(n*4)*100});
   }
   summary[method]=aggregate(runs);
   episodes[method]=runs.map(r=>({config:r.config,metrics:r.metrics}));
  }
  self.postMessage({type:'done',result:{schema:'awm-benchmark-v1',engine:'numerical',n,seed,suite,scenarios,summary,episodes}});
 }catch(e){self.postMessage({type:'error',message:e.message});}
};

