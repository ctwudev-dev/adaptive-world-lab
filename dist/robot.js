import {DEFAULTS,GRID,METHODS,PRESETS,OBJECT_RADIUS,scenario,publicConfig,runEpisode,beliefStats,prior,dist} from './robot-engine.js';
import {initCalibration} from './calibration.js';

const $=id=>document.getElementById(id);
const LABELS={fixed:'Fixed model',passive:'Passive learning',active:'Active learning'};
const NOTES={fixed:'Use the same physics belief for every move. No model update.',
  passive:'Move toward the target and learn from the motion already observed.',
  active:'Also consider an information bonus. A learning move must use the same time and move budget.'};
const COLORS={fixed:'#9cadc1',passive:'#83b9ef',active:'#9ee7d7'};
let config=scenario('change'),runs=null,method='active',completed=0,playing=false,frame=null,progress=0,source='live',lastTick=0;
let worker=null,comparison=null,request=0,loadingReplay=false,calibrationPrior=null;
const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
function setError(message=''){$('robot-input-error').textContent=message;$('robot-input-error').hidden=!message;}
function readConfig(){
  if($('robot-seed').value.trim()==='')throw Error('Enter a whole-number seed.');
  return scenario($('robot-case').value,{seed:Number($('robot-seed').value),...(calibrationPrior??{})});
}
function stop(){playing=false;if(frame!==null)cancelAnimationFrame(frame);frame=null;progress=0;lastTick=0;$('robot-play').innerHTML='<span aria-hidden="true">▶</span> Run experiment';}
function ensureRuns(){
  if(runs)return;
  config=readConfig();runs=Object.fromEntries(METHODS.map(m=>[m,runEpisode(config,m)]));source='live';
}
function invalidate(){
  stop();request++;completed=0;runs=null;source='live';loadingReplay=false;$('robot-load-contact').disabled=false;
  try{config=readConfig();ensureRuns();setError();}catch(error){setError(error.message);}
  $('robot-case-note').textContent=PRESETS[$('robot-case').value].note+(calibrationPrior?' Fitted prior means from Calibrate are applied. Selected uncertainty widths stay unchanged.':'');render();
}
function current(){return runs?.[method];}
function animationPoint(event,t){
  const trace=event.actual.trace,end=trace.at(-1).t,time=t*end;
  let i=0;while(i<trace.length-2&&trace[i+1].t<time)i++;
  const a=trace[i],b=trace[Math.min(i+1,trace.length-1)],f=b.t===a.t?1:Math.max(0,Math.min(1,(time-a.t)/(b.t-a.t)));
  return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,
    px:Number.isFinite(a.px)&&Number.isFinite(b.px)?a.px+(b.px-a.px)*f:null,
    py:Number.isFinite(a.py)&&Number.isFinite(b.py)?a.py+(b.py-a.py)*f:null,
    t:time,phase:time<=event.action.duration?'push':'coast'};
}
function snapshot(){
  const r=current(),active=r?.events[completed],previous=r?.events[completed-1];
  const point=playing&&active?animationPoint(active,progress):{x:previous?.actual.position[0]??config.start[0],y:previous?.actual.position[1]??config.start[1],phase:'rest'};
  const weights=previous?.posterior??active?.belief??prior(publicConfig(config));
  return {r,active,previous,point,weights,event:playing?active:active??previous};
}
function canvas(id){
  const el=$(id),box=el.getBoundingClientRect();if(box.width<1||box.height<1)return null;
  const dpr=Math.min(2,window.devicePixelRatio||1),w=Math.round(box.width*dpr),h=Math.round(box.height*dpr);
  if(el.width!==w||el.height!==h){el.width=w;el.height=h;}
  const ctx=el.getContext('2d');if(!ctx)return null;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,box.width,box.height);return {ctx,w:box.width,h:box.height};
}
function drawWorld(s){
  const cv=canvas('robot-world');if(!cv)return;
  const {ctx,w,h}=cv,scale=Math.min(w/3.25,h/1.75),cx=w*.5,cy=h*.53;
  const P=(x,y,z=0)=>[cx+(x*.9-y*.51)*scale,cy+(x*.24+y*.43-z)*scale];
  const path=(points,fill,stroke)=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}};
  const line=(a,b,color,width=1)=>{ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
  const ellipse=(x,y,r,fill,stroke,z=0)=>{
    const pts=Array.from({length:49},(_,i)=>P(x+r*Math.cos(i*Math.PI/24),y+r*Math.sin(i*Math.PI/24),z));path(pts,fill,stroke);
  };
  // Table geometry uses the same XY coordinates as the physics state.
  const corners=[[-1.12,-.75],[1.12,-.75],[1.12,.75],[-1.12,.75]];
  path([P(-1.12,.75),P(1.12,.75),P(1.12,.75,-.055),P(-1.12,.75,-.055)],'#0d1721','#263e4c');
  path([P(1.12,-.75),P(1.12,.75),P(1.12,.75,-.055),P(1.12,-.75,-.055)],'#111e29','#263e4c');
  path(corners.map(p=>P(...p)),'#162630','#375261');
  ctx.lineWidth=.6;
  for(let x=-1;x<=1.001;x+=.2)line(P(x,-.7),P(x,.7),'#29404a',.6);
  for(let y=-.6;y<=.601;y+=.2)line(P(-1.08,y),P(1.08,y),'#29404a',.6);
  ctx.setLineDash([3,4]);const b=config.bounds;
  path([[b[0],b[2]],[b[1],b[2]],[b[1],b[3]],[b[0],b[3]]].map(p=>P(...p)),null,'#94725277');ctx.setLineDash([]);
  const target=config.target;
  ellipse(...target,config.tolerance,'#9ee7d71b','#9ee7d7');
  line(P(target[0]-.023,target[1]),P(target[0]+.023,target[1]),'#b3f1e0');
  line(P(target[0],target[1]-.023),P(target[0],target[1]+.023),'#b3f1e0');
  const label=P(target[0],target[1]-.12,.03);ctx.font='9px system-ui,sans-serif';ctx.fillStyle='#a2d8cd';ctx.textAlign='center';ctx.fillText('TARGET',label[0],label[1]);
  const e=s.event;
  if(e){
    const {action:a,prediction:p,observation:o}=e;
    const lo=[o.start[0]+a.ux*p.low,o.start[1]+a.uy*p.low],hi=[o.start[0]+a.ux*p.high,o.start[1]+a.uy*p.high];
    ctx.globalAlpha=.32;line(P(...lo,.003),P(...hi,.003),'#83b9ef',9);ctx.globalAlpha=1;
    ctx.setLineDash([4,4]);line(P(...o.start,.005),P(...p.end,.005),'#83b9ef99',1);ctx.setLineDash([]);
    ellipse(...p.end,.018,'#83b9ef20','#a3cef5');
  }
  if(s.r){
    for(let i=0;i<completed;i++){
      const trace=s.r.events[i].actual.trace;ctx.beginPath();trace.forEach((p,k)=>{const v=P(p.x,p.y,.006);k?ctx.lineTo(...v):ctx.moveTo(...v);});ctx.strokeStyle='#d3a37477';ctx.lineWidth=1.5;ctx.stroke();
    }
    if(playing&&s.active){
      const trace=s.active.actual.trace.filter(p=>p.t<=s.point.t);ctx.beginPath();trace.forEach((p,k)=>{const v=P(p.x,p.y,.008);k?ctx.lineTo(...v):ctx.moveTo(...v);});const pos=P(s.point.x,s.point.y,.008);ctx.lineTo(...pos);ctx.strokeStyle='#f3bd89';ctx.lineWidth=2;ctx.stroke();
    }
  }
  const x=s.point.x,y=s.point.y;
  // XY gantry visual: the tool tip follows the radial contact constraint.
  const a=e?.action??{ux:1,uy:0};
  const touching=playing&&s.point.phase==='push';
  const gap=touching ? .079 : .13;
  const px=touching&&s.point.px!==null&&Number.isFinite(s.point.px)?s.point.px:x-a.ux*gap;
  const py=touching&&s.point.py!==null&&Number.isFinite(s.point.py)?s.point.py:y-a.uy*gap;
  const railY=-.83,height=.36,carriage=P(px,railY,height),elbow=P(px,py,height),tip=P(px,py,.04);
  line(P(-1.15,railY,height),P(1.15,railY,height),'#0d171f',14);
  line(P(-1.15,railY,height),P(1.15,railY,height),'#466577',6);
  line(carriage,elbow,'#09131c',13);line(carriage,elbow,'#577788',7);
  line(elbow,tip,'#101b25',12);line(elbow,tip,'#8ba6b3',6);
  ctx.fillStyle='#adc7d1';ctx.beginPath();ctx.arc(...carriage,4,0,Math.PI*2);ctx.fill();
  ellipse(px,py,.026,'#9ee7d7','#ccf6eb',.025);
  ellipse(x+.013,y+.012,OBJECT_RADIUS*1.13,'#050b10aa',null);
  // Cylinder side and cap: rendered height does not affect locked-rotation dynamics.
  ellipse(x,y,OBJECT_RADIUS,'#a96e43','#d2935d',.015);
  const front=Array.from({length:25},(_,i)=>{const t=i*Math.PI/24;return P(x+OBJECT_RADIUS*Math.cos(t),y+OBJECT_RADIUS*Math.sin(t),.015);});
  const topfront=Array.from({length:25},(_,i)=>{const t=(24-i)*Math.PI/24;return P(x+OBJECT_RADIUS*Math.cos(t),y+OBJECT_RADIUS*Math.sin(t),.08);});path([...front,...topfront],'#b77b49','#dcaa76');
  ellipse(x,y,OBJECT_RADIUS,'#f3bd86','#ffd4ab',.08);ellipse(x,y,.016,'#9e6e45',null,.081);
  const objLabel=P(x,y,.14);ctx.font='8px system-ui,sans-serif';ctx.fillStyle='#e9c59f';ctx.fillText('OBJECT',objLabel[0],objLabel[1]);
  const origin=P(-1,-.6,.006);line(origin,P(-.7,-.6,.006),'#7e9cac',1.2);line(origin,P(-1,-.3,.006),'#7e9cac',1.2);
  ctx.fillStyle='#829eaf';ctx.font='8px Consolas,monospace';ctx.fillText('x',...P(-.65,-.6));ctx.fillText('y',...P(-1,-.24));
  for (const v of [-1,0,1]){const p=P(v,.82);ctx.fillStyle='#718c9f';ctx.fillText(v.toFixed(1)+' m',p[0],p[1]+12);}
}
function drawBelief(s){
  const cv=canvas('robot-belief');if(!cv)return;
  const {ctx,w,h}=cv,left=31,bottom=h-24,top=10,right=w-9,cw=(right-left)/13,ch=(bottom-top)/19,peak=Math.max(...s.weights);
  GRID.forEach((g,i)=>{const col=i%13,row=Math.floor(i/13),v=Math.sqrt(s.weights[i]/peak);ctx.fillStyle=`rgba(${Math.round(35+110*v)},${Math.round(59+170*v)},${Math.round(73+135*v)},1)`;ctx.fillRect(left+col*cw,top+(18-row)*ch,cw+.15,ch+.15);});
  ctx.strokeStyle='#486374';ctx.lineWidth=.7;ctx.strokeRect(left,top,right-left,bottom-top);
  ctx.fillStyle='#8ba4b5';ctx.font='8px Consolas,monospace';ctx.textAlign='center';
  for(const [f,text]of [[0,'0.35'],[.5,'0.95'],[1,'1.55']])ctx.fillText(text,left+(right-left)*f,bottom+13);
  ctx.textAlign='right';ctx.fillText('.62',left-5,top+6);ctx.fillText('.35',left-5,(top+bottom)/2+3);ctx.fillText('.08',left-5,bottom);
  ctx.textAlign='left';ctx.fillText('μ',2,top+3);ctx.textAlign='right';ctx.fillText('kg',right,h-1);
  const st=beliefStats(s.weights),bx=left+(st.mass-.35)/1.2*(right-left),by=bottom-(st.mu-.08)/.54*(bottom-top);
  ctx.strokeStyle='#e1fff4';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(bx-4,by);ctx.lineTo(bx+4,by);ctx.moveTo(bx,by-4);ctx.lineTo(bx,by+4);ctx.stroke();
}
function renderDecision(s){
  const e=s.event;
  $('robot-decision-heading').textContent=s.active?'Next action':'Last completed action';
  if(!e){$('robot-decision').textContent='Choose a valid case to inspect its next action.';return;}
  $('robot-kind').textContent=e.kind==='probe'?'LEARNING MOVE':'TASK MOVE';$('robot-kind').dataset.probe=String(e.kind==='probe');
  $('robot-decision').textContent=e.kind==='probe'?'Choose this pulse for its information value as well as progress toward the target.':'Move toward the target using the current physics belief. Motion can also provide learning data.';
  if(method==='fixed')$('robot-decision').textContent='Choose a task move using the starting belief. Keep that belief after the observation.';
  $('robot-force').textContent=e.action.force.toFixed(1)+' N';$('robot-pulse').textContent=e.action.duration.toFixed(3)+' s';$('robot-info').textContent=e.prediction.info.toFixed(2)+' nats';
  $('robot-prediction-note').textContent='Predicted travel: '+(e.prediction.distance*100).toFixed(1)+' cm. Model range: '+(e.prediction.low*100).toFixed(1)+'–'+(e.prediction.high*100).toFixed(1)+' cm.';
  $('robot-candidate-note').textContent=e.candidateCount+' candidate pulses · force ≤ 8 N · duration ≤ 0.34 s';
}
function renderLog(s){
  const events=s.r?.events.slice(0,completed)??[];
  if(!events.length){$('robot-log').innerHTML='<p class="empty-state">Each completed push adds a prediction, an observation, and a model update.</p>';return;}
  $('robot-log').innerHTML=events.map(e=>{
    const st=beliefStats(e.posterior),observed=dist(e.observation.start,e.observation.end)*100;
    return '<article class="log-entry"><div class="log-entry-header"><span>'+String(e.index).padStart(2,'0')+'</span><b>'+(e.kind==='probe'?'Learning move':'Task move')+'</b><small>'+e.action.force.toFixed(1)+' N / '+e.action.duration.toFixed(3)+' s</small></div><p>Predicted travel: <b>'+(e.prediction.distance*100).toFixed(1)+' cm</b> · Observed: <b>'+observed.toFixed(1)+' cm</b><br>Model after the move: μ <b>'+st.mu.toFixed(3)+'</b> · mass <b>'+st.mass.toFixed(2)+' kg</b>'+(e.actual.contactSteps!==undefined?'<br>Contact measured: '+e.actual.normalImpulse.toFixed(3)+' N·s over '+e.actual.contactSteps+' solver steps.':'')+'</p>'+(e.reset?'<p class="surprise">Unexpected motion. Reopened the physics range before updating.</p>':'')+'</article>';
  }).reverse().join('');
}
function render(){
  const s=snapshot(),st=beliefStats(s.weights),done=s.r&&completed>=s.r.events.length;
  const shown=s.r?.events.slice(0,completed)??[];
  $('robot-strategy-note').textContent=NOTES[method];
  $('robot-engine-tag').textContent=source==='contact'?'REPLAY / MUJOCO CONTACT':'LIVE / NUMERICAL';
  $('robot-scene-status').textContent=playing?(s.point.phase==='push'?'Pusher in contact · force pulse':'Force released · observing the coast'):done?(s.r.metrics.success?'Target reached':s.r.metrics.boundary?'Table limit crossed':'Move budget used'):'Ready · inspect the prediction, then make one move';
  $('robot-moves').textContent=completed+' / '+config.maxActions;
  $('robot-probes').textContent=shown.filter(e=>e.kind==='probe').length;
  $('robot-error').textContent=(dist([s.point.x,s.point.y],config.target)*100).toFixed(1)+' cm';
  $('robot-time').textContent=shown.reduce((v,e)=>v+e.actual.time+config.setupTime,0).toFixed(2)+' s';
  $('robot-mu').textContent=st.mu.toFixed(3);$('robot-mu-range').textContent=st.muLow.toFixed(2)+'–'+st.muHigh.toFixed(2)+' / model 90%';
  $('robot-mass').textContent=st.mass.toFixed(2)+' kg';$('robot-mass-range').textContent=st.massLow.toFixed(2)+'–'+st.massHigh.toFixed(2)+' kg / model 90%';
  $('robot-truth-line').hidden=!$('robot-truth').checked;
  const truth=s.previous?.actual??{mu:config.mu,mass:config.mass};
  $('robot-truth-line').textContent='EVALUATOR ONLY / true friction '+Number(truth.mu).toFixed(3)+' · true mass '+Number(truth.mass).toFixed(2)+' kg · controller access: none';
  const valid=!$('robot-input-error').textContent;
  $('robot-play').disabled=!valid||loadingReplay;$('robot-step').disabled=!valid||playing||loadingReplay||!!done;$('robot-export').disabled=!runs;
  $('robot-outcomes').innerHTML=METHODS.map(m=>{const r=runs?.[m],show=done&&r;return '<div class="outcome"'+(show?' data-success="'+r.metrics.success+'"':'')+'><span style="color:'+COLORS[m]+'">'+LABELS[m]+'</span><div>'+(show?'<b>'+(r.metrics.success?'Target reached':r.metrics.boundary?'Out of bounds':'Budget used')+'</b><small>'+r.metrics.actions+' moves · '+r.metrics.time.toFixed(2)+' s</small>':'<b class="waiting">Awaiting experiment</b>')+'</div></div>';}).join('');
  renderDecision(s);renderLog(s);drawWorld(s);drawBelief(s);
}
function finishMove(){completed++;progress=0;lastTick=0;render();}
function tick(time){
  if(!playing)return;
  const r=current();if(completed>=r.events.length){stop();render();return;}
  if(!lastTick)lastTick=time;
  progress+=Math.min(100,time-lastTick)/1400;lastTick=time;
  if(progress>=1){finishMove();if(completed>=r.events.length){stop();render();return;}}
  drawWorld(snapshot());$('robot-scene-status').textContent=snapshot().point.phase==='push'?'Pusher in contact · force pulse':'Force released · observing the coast';
  frame=requestAnimationFrame(tick);
}
$('robot-play').addEventListener('click',()=>{
  if(playing){stop();render();return;}
  try{ensureRuns();setError();if(completed>=current().events.length)completed=0;
    if(reducedMotion){completed=current().events.length;render();return;}
    playing=true;lastTick=0;$('robot-play').textContent='Pause experiment';render();frame=requestAnimationFrame(tick);
  }catch(error){setError(error.message);render();}
});
$('robot-step').addEventListener('click',()=>{try{ensureRuns();setError();stop();if(completed<current().events.length)finishMove();}catch(error){setError(error.message);render();}});
$('robot-reset').addEventListener('click',()=>{stop();completed=0;try{readConfig();setError();}catch(error){setError(error.message);}render();});
$('robot-case').addEventListener('change',()=>{calibrationPrior=null;invalidate();});$('robot-seed').addEventListener('input',()=>{calibrationPrior=null;invalidate();});
$('robot-strategy').addEventListener('change',()=>{stop();method=$('robot-strategy').value;completed=0;render();});
$('robot-truth').addEventListener('change',render);
function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('robot-export').addEventListener('click',()=>{if(runs)download('robot-physics-session.json',{schema:'robot-physics-session-v1',engine:source==='contact'?'mujoco-pusher-contact-2d':'numerical-contact-2d',episodes:runs});});
async function getJson(path){const response=await fetch(path);if(!response.ok)throw Error('Could not load the saved file. Try again.');return response.json();}
function validateReplay(data){
  if(data.schema!=='robot-physics-session-v1'||data.engine!=='mujoco-pusher-contact-2d')throw Error('Unsupported contact replay.');
  for(const m of METHODS){const r=data.episodes?.[m];if(!r||r.schema!=='robot-physics-episode-v1'||r.method!==m||r.engine!==data.engine||!Array.isArray(r.events)||r.events.length>12)throw Error('Invalid recorded episode.');
    publicConfig(r.config);beliefStats(r.posterior);
    for(const e of r.events){beliefStats(e.belief);beliefStats(e.posterior);if(!Array.isArray(e.actual?.trace)||!e.actual.trace.length||e.actual.trace.length>10000||e.actual.trace.some(p=>![p.t,p.x,p.y].every(Number.isFinite)))throw Error('Invalid contact trajectory.');}}
  return data;
}
$('robot-load-contact').addEventListener('click',async()=>{
  stop();const token=++request;loadingReplay=true;$('robot-load-contact').disabled=true;render();
  try{const data=validateReplay(await getJson('robot-contact-demo.json'));if(token!==request)return;
    runs=data.episodes;config={...scenario('unfamiliar'),...runs.active.config};source='contact';completed=0;
    $('robot-case').value='unfamiliar';$('robot-seed').value=config.seed;
    $('robot-case-note').textContent='Saved independent contact replay: heavier object, higher friction. Changing a setting returns to the live model.';setError();
  }catch(error){if(token===request)setError(error.message);}finally{if(token===request){loadingReplay=false;$('robot-load-contact').disabled=false;render();}}
});
function showRoute(){
  const name=['experiment','calibrate','compare','method'].includes(location.hash.slice(1))?location.hash.slice(1):'experiment';
  for(const el of document.querySelectorAll('.page'))el.hidden=el.id!==name+'-page';
  for(const el of document.querySelectorAll('[data-route]')){const selected=el.dataset.route===name;el.classList.toggle('selected',selected);if(selected)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');}
  if(name!=='experiment')stop();else requestAnimationFrame(render);
  window.scrollTo({top:0,behavior:'instant'});
}
window.addEventListener('hashchange',showRoute);
new ResizeObserver(()=>{if(!$('experiment-page').hidden)render();}).observe($('robot-world'));
function validateComparison(data){
  if(data.schema!=='robot-physics-benchmark-v1'||!['numerical-contact-2d','mujoco-pusher-contact-2d'].includes(data.engine)||!Number.isInteger(data.n)||data.n<1||!data.summary)throw Error('Unsupported result file.');
  for(const m of METHODS){const s=data.summary[m];if(!s||s.n!==data.n||![s.successRate,s.successLow,s.successHigh,s.actions,s.probes,s.time,s.predictionRmse,s.boundaries].every(Number.isFinite))throw Error('Invalid result summary.');}
  return data;
}
function displayComparison(data){
  comparison=validateComparison(data);const pct=x=>(100*x).toFixed(1)+'%';
  $('robot-compare-table').innerHTML=METHODS.map(m=>{const s=data.summary[m];return '<tr><td style="color:'+COLORS[m]+'">'+LABELS[m]+'</td><td>'+s.successes+'/'+s.n+' · '+pct(s.successRate)+'<br><small>'+pct(s.successLow)+'–'+pct(s.successHigh)+'</small></td><td>'+s.actions.toFixed(2)+'</td><td>'+s.probes.toFixed(2)+'</td><td>'+s.time.toFixed(2)+' s</td><td>'+(s.predictionRmse*100).toFixed(1)+' cm</td><td>'+pct(s.boundaries)+'</td></tr>';}).join('');
  $('robot-compare-source').textContent=data.engine==='mujoco-pusher-contact-2d'?'SAVED / MUJOCO CONTACT':'COMPUTED / BROWSER';
  $('robot-compare-meta').textContent='N='+data.n+' shared cases per strategy · seed '+data.seed+' · '+data.suite+' · Wilson 95% success intervals. Means include successes and failures. Prediction RMSE is averaged across episodes.';
  const a=data.summary.active,p=data.summary.passive,delta=a.actions-p.actions;
  $('robot-compare-finding').textContent='Active reached '+a.successes+' of '+data.n+' targets; Passive reached '+p.successes+'. Active used '+Math.abs(delta).toFixed(2)+(delta>=0?' more':' fewer')+' moves per case on average. An information bonus is not a promise of better performance.';
  $('robot-compare-export').disabled=false;
}
function comparisonBusy(busy){$('robot-compare-run').disabled=busy;$('robot-compare-contact').disabled=busy;$('robot-compare-cancel').hidden=!busy;}
$('robot-compare-contact').addEventListener('click',async()=>{
  comparisonBusy(true);$('robot-compare-cancel').hidden=true;
  try{const suite=$('robot-suite').value;displayComparison(await getJson('robot-contact-'+suite+'.json'));$('robot-compare-progress').textContent='Loaded the independent contact tests. All recorded cases are available in the export.';}
  catch(error){$('robot-compare-progress').textContent=error.message;}finally{comparisonBusy(false);}
});
$('robot-compare-run').addEventListener('click',()=>{
  try{
    if(worker)worker.terminate();worker=new Worker(new URL('./robot-worker.js',import.meta.url),{type:'module'});comparisonBusy(true);$('robot-compare-progress').textContent='Computing paired browser cases...';
    const thisWorker=worker;
    worker.onmessage=event=>{if(worker!==thisWorker)return;const d=event.data;if(d.type==='progress')$('robot-compare-progress').textContent='Computed '+d.done+' / '+d.total+' shared cases.';
      if(d.type==='complete'){try{displayComparison(d.result);$('robot-compare-progress').textContent='Browser batch complete. This uses the ideal contact model.';}catch(error){$('robot-compare-progress').textContent=error.message;}worker.terminate();worker=null;comparisonBusy(false);}
      if(d.type==='error')comparisonFailed(d.message);};
    worker.onerror=()=>{if(worker===thisWorker)comparisonFailed('The worker could not run. Try the saved contact tests.');};
    worker.postMessage({n:Number($('robot-count').value),seed:2048,suite:$('robot-suite').value});
  }catch(error){comparisonFailed(error.message);}
});
function comparisonFailed(message){worker?.terminate();worker=null;comparisonBusy(false);$('robot-compare-progress').textContent=message;}
$('robot-compare-cancel').addEventListener('click',()=>comparisonFailed('Batch cancelled. Any earlier completed results remain available.'));
$('robot-compare-export').addEventListener('click',()=>{if(comparison)download('robot-physics-'+comparison.suite+'.json',comparison);});
initCalibration({onApply:parameters=>{calibrationPrior={priorMu:parameters.mu,priorMass:parameters.mass};invalidate();}});
invalidate();showRoute();
