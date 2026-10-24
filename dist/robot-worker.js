import {benchmark} from './robot-experiment.js';
self.onmessage=event=>{
  try {
    const {n,seed,suite}=event.data;
    const result=benchmark(n,seed,suite,(done,total)=>{if(done%5===0)self.postMessage({type:'progress',done,total});});
    self.postMessage({type:'complete',result});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
