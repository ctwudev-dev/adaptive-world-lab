/** Whole-trial calibration and held-out validation. All distances use SI units. */
import {G,PUSHER_MASS,GRID} from './robot-engine.js';
export const CALIBRATION_VERSION='1.0.0';
export const COLUMNS=['trial_id','split','time_s','x_m','y_m','force_n','dir_x','dir_y','pulse_s'];
export const LIMITS=Object.freeze({characters:2000000,rows:8000,trials:40,samples:400});
export const BASELINE=Object.freeze({mu:.26,mass:.75});
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const sourceLabels=new Set(['synthetic-mujoco','external-unverified','declared-physical']);
function number(value,row){
  const s=value.trim();if(!decimal.test(s)||!Number.isFinite(Number(s)))throw Error('Use finite decimal numbers at row '+row+'.');return Number(s);
}
function csvRows(text){
  if(typeof text!=='string'||text.length>LIMITS.characters)throw Error('Use a CSV smaller than 2 MB.');
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"'){if(cell!==''||closed)throw Error('Invalid CSV quoting.');quoted=true;continue;}
    if(c===','||c==='\r'||c==='\n'){
      row.push(cell);cell='';closed=false;
      if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v!==''))rows.push(row);row=[];}
    }else{if(closed)throw Error('Invalid text after a quoted CSV field.');cell+=c;}
    if(rows.length>LIMITS.rows+1)throw Error('Use at most 8,000 data rows.');
  }
  if(quoted)throw Error('A quoted CSV field was not closed.');
  if(cell!==''||row.length){row.push(cell);if(row.some(v=>v!==''))rows.push(row);}
  return rows;
}
export function parseTracksCsv(text,source='external-unverified'){
  const rows=csvRows(text),header=rows.shift()?.map(x=>x.trim());
  if(!header||header.length!==COLUMNS.length||new Set(header).size!==COLUMNS.length||COLUMNS.some(k=>!header.includes(k)))throw Error('Use the nine columns in the CSV template. Extra columns are not retained.');
  if(rows.length>LIMITS.rows)throw Error('Use at most 8,000 data rows.');
  const groups=new Map();
  rows.forEach((fields,index)=>{
    if(fields.length!==header.length)throw Error('Wrong number of fields at row '+(index+2)+'.');
    const r=Object.fromEntries(header.map((k,i)=>[k,fields[i]])),id=r.trial_id.trim();
    if(!id||id.length>80||/[\r\n\t]/.test(id))throw Error('Use a short trial label at row '+(index+2)+'.');
    const split=r.split.trim();if(!['calibration','validation'].includes(split))throw Error('Split must be calibration or validation at row '+(index+2)+'.');
    const nums=Object.fromEntries(COLUMNS.slice(2).map(k=>[k,number(r[k],index+2)]));
    const command={force:nums.force_n,duration:nums.pulse_s,ux:nums.dir_x,uy:nums.dir_y};
    if(!groups.has(id))groups.set(id,{split,command,samples:[]});
    const trial=groups.get(id);
    if(trial.split!==split||Object.keys(command).some(k=>Math.abs(command[k]-trial.command[k])>1e-10))throw Error('Keep one split and one force pulse per trial.');
    trial.samples.push({t:nums.time_s,x:nums.x_m,y:nums.y_m});
  });
  // Original trial labels never leave this parser; exports use generated labels.
  return validateDataset({source,trials:[...groups.values()]});
}
export function validateParameters(p){
  if(!p||!finite(p.mu)||p.mu<.08||p.mu>.62||!finite(p.mass)||p.mass<.35||p.mass>1.55)throw Error('Friction must be 0.08–0.62 and mass 0.35–1.55 kg.');
  return {mu:p.mu,mass:p.mass};
}
export function validateDataset(input){
  if(!input||!sourceLabels.has(input.source)||!Array.isArray(input.trials)||input.trials.length>LIMITS.trials)throw Error('Use a supported source and at most 40 trials.');
  let rows=0;
  const trials=input.trials.map((r,i)=>{
    if(!r||!['calibration','validation'].includes(r.split))throw Error('Every trial needs a calibration or validation split.');
    const a=r.command;
    if(!a||![a.force,a.duration,a.ux,a.uy].every(finite)||a.force<1||a.force>8||a.duration<.025||a.duration>.34||Math.abs(Math.hypot(a.ux,a.uy)-1)>.00001)throw Error('Use a calibrated 1–8 N force, a 0.025–0.34 s pulse, and a unit direction vector.');
    if(!Array.isArray(r.samples)||r.samples.length<8||r.samples.length>LIMITS.samples)throw Error('Use 8–400 samples per trial.');
    const samples=r.samples.map(p=>{if(!p||![p.t,p.x,p.y].every(finite)||p.t<0||p.t>10||Math.abs(p.x)>5||Math.abs(p.y)>5)throw Error('Use seconds and meters within the supported recording range.');return {t:p.t,x:p.x,y:p.y};});
    if(Math.abs(samples[0].t)>1e-8||samples.some((p,j)=>j>0&&p.t<=samples[j-1].t))throw Error('Each trial must start at time zero with strictly increasing times.');
    if(samples.filter(p=>p.t>0&&p.t<=a.duration+1e-8).length<2||samples.filter(p=>p.t>a.duration+1e-8).length<3)throw Error('Record at least two moving-phase samples during the pulse and three after release.');
    rows+=samples.length;
    return {id:'trial-'+String(i+1).padStart(3,'0'),split:r.split,command:{force:a.force,duration:a.duration,ux:a.ux,uy:a.uy},samples};
  });
  if(rows>LIMITS.rows)throw Error('Use at most 8,000 data rows.');
  for(const split of ['calibration','validation'])if(trials.filter(t=>t.split===split).length<2)throw Error('Use at least two complete calibration trials and two separate validation trials.');
  const calibrationSignatures=new Set(trials.filter(t=>t.split==='calibration').map(t=>JSON.stringify({command:t.command,samples:t.samples})));
  if(trials.some(t=>t.split==='validation'&&calibrationSignatures.has(JSON.stringify({command:t.command,samples:t.samples}))))throw Error('A calibration track is duplicated in validation. Use separate recorded trials.');
  return {schema:'robot-physics-tracks-v1',source:input.source,trials};
}
export function toTracksCsv(input){
  const d=validateDataset(input),lines=[COLUMNS.join(',')];
  for(const t of d.trials)for(const p of t.samples)lines.push([t.id,t.split,p.t,p.x,p.y,t.command.force,t.command.ux,t.command.uy,t.command.duration].join(','));
  return lines.join('\n')+'\n';
}
export function distanceAt(params,command,time){
  const a=Math.max(0,(command.force-params.mu*params.mass*G)/(params.mass+PUSHER_MASS));
  const pushTime=Math.min(time,command.duration),v=a*command.duration;
  const coast=Math.max(0,Math.min(time-command.duration,v/(params.mu*G)));
  return .5*a*pushTime**2+v*coast-.5*params.mu*G*coast**2;
}
export function predictTrack(params,trial){
  const start=trial.samples[0],a=trial.command;
  return trial.samples.map(p=>{const d=distanceAt(params,a,p.t);return {t:p.t,x:start.x+a.ux*d,y:start.y+a.uy*d};});
}
function trialError(params,trial){
  const start=trial.samples[0],a=trial.command;let sum=0,lateralSum=0,end=0;
  for(let i=1;i<trial.samples.length;i++){
    const p=trial.samples[i],d=distanceAt(params,a,p.t),dx=p.x-start.x-a.ux*d,dy=p.y-start.y-a.uy*d;
    const e=dx*dx+dy*dy;sum+=e;lateralSum+=(-a.uy*(p.x-start.x)+a.ux*(p.y-start.y))**2;end=e;
  }
  return {mse:sum/(trial.samples.length-1),endError:Math.sqrt(end),lateralRmse:Math.sqrt(lateralSum/(trial.samples.length-1))};
}
function objective(params,trials){return trials.reduce((s,t)=>s+trialError(params,t).mse,0)/trials.length;}
function summarize(params,trials){
  const errors=trials.map(t=>({id:t.id,...trialError(params,t)}));
  return {trials:trials.length,rmse:Math.sqrt(errors.reduce((s,e)=>s+e.mse,0)/errors.length),
    meanEndError:errors.reduce((s,e)=>s+e.endError,0)/errors.length,
    worstTrialRmse:Math.sqrt(Math.max(...errors.map(e=>e.mse))),
    lateralRmse:Math.sqrt(errors.reduce((s,e)=>s+e.lateralRmse**2,0)/errors.length)};
}
function sensitivity(params,trials){
  let aa=0,ab=0,bb=0;
  const h=.0001;
  for(const t of trials){const a=t.command;
    for(const p of t.samples.slice(1)){
      const dm=(distanceAt({...params,mu:params.mu+h},a,p.t)-distanceAt({...params,mu:params.mu-h},a,p.t))/(2*h)*.54;
      const dw=(distanceAt({...params,mass:params.mass+h},a,p.t)-distanceAt({...params,mass:params.mass-h},a,p.t))/(2*h)*1.2;
      const weight=1/(trials.length*(t.samples.length-1));aa+=dm*dm*weight;ab+=dm*dw*weight;bb+=dw*dw*weight;
    }
  }
  const trace=aa+bb,disc=Math.sqrt((aa-bb)**2+4*ab*ab),high=(trace+disc)/2,low=Math.max(0,(trace-disc)/2);
  return {condition:low>1e-12?Math.sqrt(high/low):null,minimumSensitivity:Math.sqrt(low)};
}
export function calibrate(input,baseline=BASELINE,assumptionsConfirmed=false){
  const dataset=validateDataset(input);baseline=validateParameters(baseline);
  if(assumptionsConfirmed!==true)throw Error('Confirm the measurement assumptions before fitting.');
  // No validation positions are accessed by the parameter search or diagnostics.
  const training=dataset.trials.filter(t=>t.split==='calibration'),validation=dataset.trials.filter(t=>t.split==='validation');
  const landscape=GRID.map(g=>({...g,rmse:Math.sqrt(objective(g,training))}));
  let best=landscape.reduce((a,b)=>b.rmse<a.rmse?b:a),muStep=.03,massStep=.1,evaluations=landscape.length;
  for(let level=0;level<4;level++){
    const center={mu:best.mu,mass:best.mass};muStep/=4;massStep/=4;
    for(let i=-4;i<=4;i++)for(let j=-4;j<=4;j++){
      const p={mu:Math.max(.08,Math.min(.62,center.mu+i*muStep)),mass:Math.max(.35,Math.min(1.55,center.mass+j*massStep))};
      const rmse=Math.sqrt(objective(p,training));evaluations++;if(rmse<best.rmse)best={...p,rmse};
    }
  }
  const parameters={mu:best.mu,mass:best.mass},diagnostic=sensitivity(parameters,training);
  const motion=Math.sqrt(training.reduce((s,t)=>{const first=t.samples[0],last=t.samples.at(-1);return s+(last.x-first.x)**2+(last.y-first.y)**2;},0)/training.length);
  const diagnostics=[];
  if(motion<.01)diagnostics.push({code:'low-motion',message:'Too little motion to identify both parameters. Collect more informative trials.'});
  if(diagnostic.condition===null||diagnostic.condition>100)diagnostics.push({code:'weak-identification',message:'Mass and friction are poorly separated by these calibration trials.'});
  if(parameters.mu<.085||parameters.mu>.615||parameters.mass<.37||parameters.mass>1.53)diagnostics.push({code:'parameter-limit',message:'The best fit is near a search limit. Check the model and parameter range.'});
  const before={calibration:summarize(baseline,training),validation:summarize(baseline,validation)};
  const after={calibration:summarize(parameters,training),validation:summarize(parameters,validation)};
  const delta=before.validation.rmse-after.validation.rmse;
  const improved=delta>Math.max(.0005,before.validation.rmse*.01);
  if(!improved)diagnostics.push({code:'no-validation-gain',message:'Held-out error did not improve beyond the declared reporting threshold.'});
  if(after.validation.rmse>Math.max(.01,3*after.calibration.rmse))diagnostics.push({code:'validation-gap',message:'Validation error remains much larger than calibration error. Check condition changes and model mismatch.'});
  if(after.validation.lateralRmse>.01)diagnostics.push({code:'lateral-motion',message:'Off-axis motion is large for a radial translation model.'});
  const identifiable=!diagnostics.some(d=>['low-motion','weak-identification','parameter-limit'].includes(d.code));
  const trials=dataset.trials.map(t=>({id:t.id,split:t.split,samples:t.samples.length,
    beforeRmse:Math.sqrt(trialError(baseline,t).mse),afterRmse:Math.sqrt(trialError(parameters,t).mse),
    beforeEndError:trialError(baseline,t).endError,afterEndError:trialError(parameters,t).endError}));
  return {schema:'robot-physics-calibration-v1',algorithmVersion:CALIBRATION_VERSION,source:dataset.source,
    assumptions:{startAtRest:true,calibratedConstantMotorForce:true,centeredRadialContact:true,oneObjectAndSurface:true,pusherMassKg:PUSHER_MASS},
    baseline,parameters,before,after,diagnostics,identification:{...diagnostic,motionRms:motion,identifiable},
    validation:{improved,absoluteReduction:delta,relativeReduction:before.validation.rmse>1e-12?delta/before.validation.rmse:null,
      trialsImproved:trials.filter(t=>t.split==='validation'&&t.afterRmse<t.beforeRmse).length,
      reportingThreshold:'Reduction greater than 0.5 mm and 1% of baseline error; not a significance test.'},
    search:{evaluations,calibrationTrials:training.length,validationTrials:validation.length,validationUsedForFit:false},
    landscape,trials,realWorldVerified:false,deploymentApproved:false};
}
export function exportCalibration(report){
  if(report?.schema!=='robot-physics-calibration-v1')throw Error('Run a calibration first.');
  // Rebuild an allowlisted report; no file names, original labels or raw positions.
  const out={};
  for(const k of ['schema','algorithmVersion','source','assumptions','baseline','parameters','before','after','diagnostics','identification','validation','search','trials'])out[k]=JSON.parse(JSON.stringify(report[k]));
  out.realWorldVerified=false;out.deploymentApproved=false;return out;
}
