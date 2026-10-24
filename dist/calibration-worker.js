import {calibrate} from './calibration-engine.js';
self.onmessage=event=>{try{const {dataset,baseline,confirmed}=event.data;self.postMessage({type:'complete',report:calibrate(dataset,baseline,confirmed)});}catch(error){self.postMessage({type:'error',message:error.message});}};
