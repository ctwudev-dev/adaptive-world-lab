import './business.js';
import {DEFAULTS,GRID,METHODS,priorFor,beliefStats,runEpisode,validateConfig} from './engine.js';
const $=id=>document.getElementById(id), $$=s=>[...document.querySelectorAll(s)];
const presets={
 slick:{mu:.10,drag:0,shiftMu:null,note:'The surface is more slippery than expected. A fast release may cross the boundary.'},
 moderate:{mu:.16,drag:0,shiftMu:null,note:'Learning during the task may work in one move. Check whether a separate probe is worth another move.'},
 matched:{mu:.44,drag:0,shiftMu:null,note:'The fixed model starts with the right friction. Extra probes may only add cost.'},
 rough:{mu:.70,drag:0,shiftMu:null,note:'The box stops quickly. Reach the target within the same move limit.'},
 shift:{mu:.16,drag:0,shiftMu:.65,shiftAfter:1,note:'After the first move, friction changes to 0.65 without warning the controller.'},
 drag:{mu:.22,drag:.7,shiftMu:null,note:'The world adds drag of -0.7v|v|. The model only knows about sliding friction.'}
};
let method='active',runs=null,config={...DEFAULTS},completed=0,playing=false,tick=0,last=0,speed=1,raf=0,shownResults=false,source='live',worker=null,benchmark=null,toastTimer;
function toast(t){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function readConfig(){
 const p=presets[$('preset').value],seed=Number($('seed').value);
 const c={...DEFAULTS,...p,mu:Number($('mu').value),prior:Number($('prior').value),noise:Number($('noise').value)/1000,seed};
 delete c.note;
 if(!Number.isInteger(seed)||seed<0||seed>4294967295)throw new Error('The seed must be a whole number from 0 to 4294967295.');
 validateConfig(c);return c;
}
function ranges(){
 for(const id of ['mu','prior','noise']){const el=$(id);el.style.setProperty('--range-p',((+el.value-+el.min)/(+el.max-+el.min)*100)+'%');}
 $('mu-value').textContent=(+$('mu').value).toFixed(2);$('prior-value').textContent=(+$('prior').value).toFixed(2);$('noise-value').textContent=$('noise').value+' mm';
}
function current(){return runs?.[method];}
function initialWeights(){return method==='fixed'?GRID.map((_,i)=>i===GRID.reduce((best,m,j)=>Math.abs(m-config.prior)<Math.abs(GRID[best]-config.prior)?j:best,0)?1:0):priorFor(config);}
function snapshot(){
 const r=current(),n=completed;let x=config.start,w=initialWeights(),event=null;
 if(r&&n>0){event=r.events[n-1];x=event.actual.x;w=event.posterior;}
 let fraction=0;
 if((playing||tick>0)&&r&&n<r.events.length){
  event=r.events[n];const duration=visualDuration(event);fraction=Math.max(0,Math.min(1,(tick-450)/(duration-1000)));
  const trace=event.actual.trace,t=fraction*trace.at(-1).t;let i=0;while(i<trace.length-2&&trace[i+1].t<t)i++;
  const a=trace[i],b=trace[Math.min(i+1,trace.length-1)],p=b.t>a.t?(t-a.t)/(b.t-a.t):0;x=a.x+(b.x-a.x)*Math.max(0,Math.min(1,p));
  w=event.belief;
 }
 return{x,w,event,fraction,done:!!r&&n>=r.events.length};
}
function visualDuration(e){return Math.max(1600,Math.min(3300,e.observation.duration*1000+1000));}
function stop(){playing=false;cancelAnimationFrame(raf);last=0;updateButton();}
function invalidate(){
 stop();runs=null;completed=0;tick=0;shownResults=false;source='live';try{config=readConfig();}catch(e){toast(e.message);}
 ranges();render();renderCards();
}
function ensureRuns(){if(runs)return;config=readConfig();runs=Object.fromEntries(Object.keys(METHODS).map(m=>[m,runEpisode(m,config)]));}
function updateButton(){const r=current();$('run').innerHTML=playing?'<span class="play-icon">Ⅱ</span><span>Pause</span><kbd>↵</kbd>':('<span class="play-icon">▶</span><span>'+(r&&completed>=r.events.length?'Replay':r&&completed?'Continue':'Start experiment')+'</span><kbd>↵</kbd>');}
function animate(now){
 if(!playing)return;
 if(last)tick+=(now-last)*speed;last=now;
 const r=current();
 while(completed<r.events.length&&tick>=visualDuration(r.events[completed])){tick-=visualDuration(r.events[completed]);completed++;renderLog();}
 if(completed>=r.events.length){shownResults=true;stop();renderCards();render();return;}
 render();raf=requestAnimationFrame(animate);
}
function play(){
 try{ensureRuns();}catch(e){toast(e.message);return;}
 if(playing){stop();render();return;}
 if(completed>=current().events.length){completed=0;tick=0;}
 playing=true;last=0;updateButton();renderLog();raf=requestAnimationFrame(animate);
}
function step(){
 try{ensureRuns();}catch(e){toast(e.message);return;}
 stop();tick=0;if(completed>=current().events.length)completed=0;completed++;shownResults=true;render();renderCards();
}
function render(){
 const s=snapshot(),st=beliefStats(s.w),r=current();
 $('metric-actions').innerHTML=completed+' <small>/ '+config.maxActions+'</small>';
 $('metric-mu').textContent=st.mean.toFixed(3);$('metric-ci').textContent=st.low.toFixed(3)+' – '+st.high.toFixed(3);
 $('metric-error').innerHTML=(Math.abs(s.x-config.target)*100).toFixed(1)+' <small>cm</small>';
 $('uncertainty').textContent='σ = '+st.sd.toFixed(3);
 $('belief-detail').textContent=method==='fixed'?'Uses one friction estimate and never updates it.':method==='robust'?'Keeps the starting belief and plans for the full friction range.':completed?'Observations narrow the estimate. The model may still be wrong.':'No observations yet. Several friction values are still possible.';
 let message='Observe, then decide whether a probe would help.',status='Ready to start';
 if(playing){status='Move '+(completed+1)+' / '+(s.event.kind==='probe'?'Probe':'Task move');message=s.event.kind==='probe'?'Try a small move to learn about the surface.':'Choose a release speed using the current friction estimate.';}
 else if(s.done){status=r.metrics.success?'Target reached':'Run finished';message=r.metrics.success?'The box center is inside the target range.':r.metrics.boundary?'The box crossed the boundary. This run failed.':'The move limit was reached before the target.';}
 else if(tick>0){status='Paused';message='Progress is saved. Continue or take one step.';}
 else if(completed){status='Move '+completed+' complete';message=s.event.reset?'The prediction was far off. Reopen the starting friction range.':'Use the new observation to plan the next move.';}
 $('scene-status').textContent=status;$('scene-message').lastElementChild.textContent=message;
 $('engine-badge').textContent=source==='live'?'Numerical physics · live':(r?.engine?.startsWith('mujoco')?'MuJoCo contact physics · recorded':'Numerical physics · imported');
 drawWorld(s);drawBelief(s.w);renderLog();updateButton();
}
function canvasContext(id){
 const el=$(id),rect=el.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
 if(!rect.width||!rect.height)return null;
 const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);if(el.width!==w||el.height!==h){el.width=w;el.height=h;}
 const ctx=el.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);return{ctx,w:rect.width,h:rect.height};
}
function round(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function drawWorld(s){
 const cv=canvasContext('world');if(!cv)return;const{ctx,w,h}=cv;
 const max=Math.max(2.4,s.x+.12),left=38,right=w-30,scale=(right-left)/max,X=x=>left+x*scale,y=h*.35,th=84,cy=y+th/2;
 const col=METHODS[method].color;
 ctx.fillStyle='#10171e';round(ctx,left,y,2.4*scale,th,4);ctx.fill();
 ctx.strokeStyle='#293744';ctx.lineWidth=1;ctx.stroke();
 // A shallow front edge gives the table its physical depth.
 ctx.fillStyle='#0c1219';ctx.beginPath();ctx.moveTo(left,y+th);ctx.lineTo(X(2.4),y+th);ctx.lineTo(X(2.4)-6,y+th+10);ctx.lineTo(left+6,y+th+10);ctx.closePath();ctx.fill();ctx.strokeStyle='#25313f';ctx.stroke();
 ctx.save();ctx.beginPath();ctx.rect(left,y,2.4*scale,th);ctx.clip();
 for(let x=0;x<=2.4;x+=.1){ctx.strokeStyle=Math.round(x*10)%4===0?'#283744':'#1d2935';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(X(x),y);ctx.lineTo(X(x),y+th);ctx.stroke();}
 for(let a=0;a<5;a++){ctx.strokeStyle='#1e2a35';ctx.beginPath();ctx.moveTo(left,y+a*th/4);ctx.lineTo(X(2.4),y+a*th/4);ctx.stroke();}
 ctx.fillStyle='#72d4bd13';ctx.fillRect(X(config.target-config.tolerance),y,2*config.tolerance*scale,th);
 ctx.strokeStyle='#72d4bd77';ctx.setLineDash([3,4]);ctx.strokeRect(X(config.target-config.tolerance),y+1,2*config.tolerance*scale,th-2);ctx.setLineDash([]);
 for(const x of [config.lo,config.hi]){ctx.strokeStyle='#b5725b70';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(X(x),y);ctx.lineTo(X(x),y+th);ctx.stroke();ctx.setLineDash([]);}
 if(s.event){
  const p=s.event.prediction;ctx.fillStyle=col+'12';ctx.fillRect(X(p.low),y+5,(p.high-p.low)*scale,th-10);
  ctx.strokeStyle=col+'44';ctx.setLineDash([3,4]);ctx.strokeRect(X(p.low),y+5,Math.max(1,(p.high-p.low)*scale),th-10);ctx.setLineDash([]);
  const start=s.event.actual.trace[0].x;ctx.strokeStyle=col+'55';ctx.lineWidth=2;ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(X(start),cy);ctx.lineTo(X(s.x),cy);ctx.stroke();ctx.setLineDash([]);
 }
 ctx.restore();
 ctx.font='9px Consolas,monospace';ctx.textAlign='center';ctx.fillStyle='#61758c';
 for(let x=0;x<=max;x+=.4){ctx.fillText(x.toFixed(1),X(x),y+th+31);}
 ctx.fillStyle='#4b6079';ctx.font='8px Consolas,monospace';ctx.fillText('m',right+8,y+th+31);
 ctx.fillStyle='#72d4bd';ctx.font='9px system-ui,sans-serif';ctx.fillText('Target '+config.target.toFixed(2)+' m',X(config.target),y-17);
 ctx.strokeStyle='#72d4bd77';ctx.beginPath();ctx.moveTo(X(config.target),y-10);ctx.lineTo(X(config.target),y-3);ctx.stroke();
 if(s.event){
  const px=X(s.event.prediction.mean);
  if(px>=left&&px<=right){ctx.strokeStyle='#bac8da99';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(px,y-3);ctx.lineTo(px,y+th+5);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#8f9eb1';ctx.font='8px system-ui,sans-serif';ctx.fillText('Predicted '+s.event.prediction.mean.toFixed(2),px,y+th+49);}
 }
 // Calibrated launcher, represented separately from the orange box.
 const bx=X(s.x),bw=Math.max(19,Math.min(29,.11*scale)),dir=s.event?Math.sign(s.event.velocity):1;
 if(!s.done){const px=bx-dir*(bw/2+26);ctx.strokeStyle='#54779b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px-dir*12,cy);ctx.lineTo(bx-dir*(bw/2+8),cy);ctx.stroke();ctx.fillStyle='#1c344a';ctx.strokeStyle='#5d88b5';round(ctx,px-9,cy-15,18,30,4);ctx.fill();ctx.stroke();ctx.fillStyle='#82abd1';ctx.beginPath();ctx.arc(bx-dir*(bw/2+8),cy,3,0,2*Math.PI);ctx.fill();}
 ctx.shadowColor=col+'33';ctx.shadowBlur=20;ctx.fillStyle='#b87843';ctx.beginPath();ctx.moveTo(bx-bw/2,cy+bw/2);ctx.lineTo(bx+bw/2,cy+bw/2);ctx.lineTo(bx+bw/2-4,cy+bw/2+7);ctx.lineTo(bx-bw/2+3,cy+bw/2+7);ctx.closePath();ctx.fill();ctx.shadowBlur=0;
 const grad=ctx.createLinearGradient(bx-bw/2,cy-bw/2,bx+bw/2,cy+bw/2);grad.addColorStop(0,'#ffbf83');grad.addColorStop(1,'#d38a4c');ctx.fillStyle=grad;ctx.strokeStyle='#f4c79b';ctx.lineWidth=1;round(ctx,bx-bw/2,cy-bw/2,bw,bw,2);ctx.fill();ctx.stroke();ctx.fillStyle='#6a462c';ctx.fillRect(bx-3,cy-3,6,6);
 ctx.fillStyle='#c8a787';ctx.font='8px Consolas,monospace';ctx.textAlign='center';ctx.fillText('BOX',bx,cy-bw/2-11);
 if($('reveal').checked){const mu=s.event?s.event.actual.mu:config.mu;ctx.textAlign='left';ctx.fillStyle='#ab9078';ctx.font='9px Consolas,monospace';ctx.fillText('GROUND TRUTH  μ = '+mu.toFixed(3)+(config.drag?'  β = '+config.drag:''),left,y+th+68);}
}
function drawBelief(weights){
 const cv=canvasContext('belief');if(!cv)return;const{ctx,w,h}=cv,left=31,right=w-18,top=12,base=h-26,prior=priorFor(config),peak=Math.max(...weights,...prior)*1.1,X=mu=>left+(mu-.08)/.72*(right-left),Y=p=>base-p/peak*(base-top);
 ctx.font='8px Consolas,monospace';ctx.textAlign='center';ctx.fillStyle='#596f8a';
 for(let mu=.1;mu<=.81;mu+=.1){const x=X(mu);ctx.strokeStyle='#223040';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,base);ctx.stroke();ctx.fillText(mu.toFixed(1),x,base+15);}
 ctx.strokeStyle='#2e3a48';ctx.beginPath();ctx.moveTo(left,base);ctx.lineTo(right,base);ctx.stroke();
 function plot(p,color,fill){ctx.beginPath();ctx.moveTo(X(GRID[0]),base);GRID.forEach((mu,i)=>ctx.lineTo(X(mu),Y(p[i])));ctx.lineTo(X(GRID.at(-1)),base);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.stroke();}
 plot(prior,'#62758b','#657c9410');const g=ctx.createLinearGradient(0,top,0,base);g.addColorStop(0,METHODS[method].color+'55');g.addColorStop(1,METHODS[method].color+'05');plot(weights,METHODS[method].color,g);
 if($('reveal').checked){const s=snapshot(),mu=s.event?.actual.mu??config.mu;ctx.strokeStyle='#72d4bd';ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(X(mu),top);ctx.lineTo(X(mu),base);ctx.stroke();ctx.setLineDash([]);}
 ctx.textAlign='right';ctx.fillStyle='#63778f';ctx.font='8px Consolas,monospace';ctx.fillText('μ',w-7,h-11);
}
let lastLogKey='';
function renderLog(){
 const r=current(),inProgress=(playing||tick>0)&&r&&completed<r.events.length,key=[method,completed,!!inProgress,!!r,source].join(':');if(key===lastLogKey)return;lastLogKey=key;
 if(!r||(!completed&&!inProgress)){$('event-log').innerHTML='<div class="empty-log"><span>⌁</span><p>Each move is a small physics experiment.</p><small>Predictions, observations, and model updates appear here.</small></div>';return;}
 const count=completed+(inProgress?1:0);
 $('event-log').innerHTML=r.events.slice(0,count).map((e,i)=>{
  const done=i<completed,st=beliefStats(e.posterior),probe=e.kind==='probe';
  return '<div class="log-entry"><div class="log-title"><b class="'+(probe?'':'task')+'">'+String(i+1).padStart(2,'0')+'</b><span>'+(probe?'Probe':'Task move')+'</span><span>'+e.velocity.toFixed(2)+' m/s</span></div><p class="log-body">Predicted stop: <strong>'+e.prediction.mean.toFixed(3)+' m</strong>'+(done?' · Actual: <strong>'+e.actual.x.toFixed(3)+' m</strong><br>':'<br>')+(done?((method==='fixed'||method==='robust')?'Keeps the same friction model.':'New estimate: μ̂ = <strong>'+st.mean.toFixed(3)+'</strong> · σ <strong>'+st.sd.toFixed(3)+'</strong>'):(probe?'Expected information gain: '+e.info.toFixed(2)+' nats':'Acts using the current belief.'))+(done&&e.reset?'<br><span class="fail">Large prediction error. Reopen the starting belief.</span>':'')+'</p></div>';
 }).reverse().join('');
}
function renderCards(){
 $('result-cards').innerHTML=Object.entries(METHODS).map(([m,d])=>{const r=runs?.[m];return '<div class="result-card"><span><i class="method-dot '+m+'"></i>'+d.label+'</span>'+(shownResults&&r?'<strong class="'+(r.metrics.success?'pass':'fail')+'">'+(r.metrics.success?'Target reached':r.metrics.boundary?'Out of bounds':'Move limit reached')+'</strong><small>'+r.metrics.actions+' moves · '+r.metrics.time.toFixed(2)+' s</small>':'<strong class="waiting">—</strong><small>AWAITING EXPERIMENT</small>')+'</div>';}).join('');
}
function showView(name){
 if(!['proposal','lab','benchmark','method'].includes(name))name='proposal';
 $$('.view').forEach(el=>el.hidden=el.id!==name+'-view');$$('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===name));
 if(name==='lab')requestAnimationFrame(()=>render());window.scrollTo({top:0,behavior:'instant'});
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.view;}));window.addEventListener('hashchange',()=>showView(location.hash.slice(1)));
$('preset').addEventListener('change',()=>{$('mu').value=presets[$('preset').value].mu;$('scenario-note').textContent=presets[$('preset').value].note;invalidate();});
for(const id of ['mu','prior','noise','seed'])$(id).addEventListener('input',()=>{if(id==='mu')$('scenario-note').textContent='Custom friction. Other settings follow the selected case.';invalidate();});
$('new-seed').addEventListener('click',()=>{$('seed').value=crypto.getRandomValues(new Uint32Array(1))[0];invalidate();});
$('run').addEventListener('click',play);$('step').addEventListener('click',step);
$('reset').addEventListener('click',()=>{stop();completed=0;tick=0;shownResults=false;lastLogKey='';render();renderCards();});
$('reveal').addEventListener('change',render);$('speed').addEventListener('click',()=>{speed=speed===1?2:speed===2?.5:1;$('speed').textContent=speed+'×';});
$$('[data-method]').forEach(b=>b.addEventListener('click',()=>{
 if(runs&&!runs[b.dataset.method]){toast('The imported file has no recording for this strategy.');return;}
 stop();method=b.dataset.method;completed=shownResults?(current()?.events.length??0):0;tick=0;lastLogKey='';
 $$('[data-method]').forEach(btn=>{const on=btn.dataset.method===method;btn.classList.toggle('selected',on);btn.setAttribute('aria-selected',String(on));});render();
}));
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.repeat&&!['INPUT','SELECT','BUTTON','A','LABEL'].includes(document.activeElement.tagName)&&!$('lab-view').hidden){e.preventDefault();play();}});
new ResizeObserver(()=>{if(!$('lab-view').hidden)render();}).observe($('world'));
function download(name,text,type='application/json'){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);}
$('export-session').addEventListener('click',()=>{try{ensureRuns();download('awm-session-'+config.seed+'.json',JSON.stringify({schema:'awm-session-v1',engine:source==='live'?'numerical':'imported',episodes:runs},null,2));}catch(e){toast(e.message);}});
function validateSession(data){
 if(data.schema!=='awm-session-v1'||!data.episodes||typeof data.episodes!=='object')throw new Error('Use an awm-session-v1 JSON file from the Python demo command.');
 const keys=Object.keys(data.episodes);if(!keys.length||keys.length>4||keys.some(k=>!METHODS[k]))throw new Error('Invalid strategy field.');
 for(const [m,r]of Object.entries(data.episodes)){
  if(r.schema!=='awm-episode-v1'||r.method!==m||!['numerical-1d','mujoco-contact-1d'].includes(r.engine))throw new Error('Unsupported physics engine or episode format.');
  validateConfig(r.config);
  if(!Array.isArray(r.events)||r.events.length>20||!validWeights(r.posterior))throw new Error('Invalid recording format.');
  for(const e of r.events){
   if(!validWeights(e.belief)||!validWeights(e.posterior)||!['probe','task'].includes(e.kind)||!e.observation||!e.actual||!e.prediction)throw new Error('Invalid observation or belief field.');
   for(const v of [e.velocity,e.observation.start,e.observation.end,e.observation.duration,e.actual.x,e.actual.mu,e.prediction.mean,e.prediction.low,e.prediction.high])if(!Number.isFinite(v)||Math.abs(v)>100)throw new Error('Invalid values in the recording.');
   if(e.kind==='probe'&&!Number.isFinite(e.info))throw new Error('Invalid information gain.');
   if(!Array.isArray(e.actual.trace)||!e.actual.trace.length||e.actual.trace.length>10000)throw new Error('Invalid number of recording points.');
   let t=-1;for(const p of e.actual.trace){if(![p.x,p.v,p.t].every(Number.isFinite)||p.t<t||p.t<0||Math.abs(p.x)>100)throw new Error('Invalid recording coordinates.');t=p.t;}
  }
  if(!r.metrics||['actions','probes','error','time','energy','path','muError','predictionRmse'].some(k=>!Number.isFinite(r.metrics[k]))||typeof r.metrics.success!=='boolean'||typeof r.metrics.boundary!=='boolean')throw new Error('Invalid result format.');
 }
 return data.episodes;
}
function validWeights(w){return Array.isArray(w)&&w.length===81&&w.every(x=>Number.isFinite(x)&&x>=0)&&Math.abs(w.reduce((s,x)=>s+x,0)-1)<1e-5;}
function loadSession(data){
 const incoming=validateSession(data);stop();runs=incoming;source='recorded';if(!runs[method])method=Object.keys(runs)[0];config={...current().config};
 $('preset').value=config.shiftMu!==null?'shift':config.drag?'drag':config.mu>.6?'rough':Math.abs(config.mu-.44)<.01?'matched':config.mu<.13?'slick':'moderate';
 $('scenario-note').textContent='Recording loaded. Changing a setting starts a new numerical run.';
 $('mu').value=config.mu;$('prior').value=config.prior;$('noise').value=config.noise*1000;$('seed').value=config.seed;ranges();
 completed=0;tick=0;shownResults=false;lastLogKey='';$$('[data-method]').forEach(b=>{b.classList.toggle('selected',b.dataset.method===method);b.setAttribute('aria-selected',String(b.dataset.method===method));});
 location.hash='lab';showView('lab');render();renderCards();toast('Recording loaded. Press Start experiment to replay. Change a setting to return to live simulation.');
}
$('mujoco-load').addEventListener('click',async()=>{try{const response=await fetch('mujoco-demo.json');if(!response.ok)throw new Error('Could not load the MuJoCo recording.');loadSession(await response.json());}catch(e){toast(e.message);}});
$('import-file').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>10*1024*1024)throw new Error('Use a JSON recording smaller than 10 MB.');loadSession(JSON.parse(await f.text()));}catch(e){toast(e.message);}finally{e.target.value='';}});
function renderBenchmark(data){
 benchmark=data;$('benchmark-empty').hidden=true;$('benchmark-results').hidden=false;
 const source=data.engine==='mujoco'?'MuJoCo contact physics (saved runs)':'Browser numerical physics (live runs)';
 const suite={uniform:'Unknown fixed friction',shift:'Sudden friction change',mismatch:'Extra drag'}[data.suite]??data.suite;
 $('bench-meta').textContent=source+' · '+suite+' · N='+data.n+' per strategy · seed '+data.seed;
 $('benchmark-bars').innerHTML=Object.entries(METHODS).map(([m,d])=>{const s=data.summary[m];return '<div class="bench-bar-row"><span><i class="method-dot '+m+'"></i>'+d.label+'</span><div class="bench-bar"><div class="fill" style="width:'+s.successRate*100+'%;background:'+d.color+'"></div><div class="interval" style="left:'+s.successCI[0]*100+'%;width:'+(s.successCI[1]-s.successCI[0])*100+'%"></div></div><strong style="color:'+d.color+'">'+(s.successRate*100).toFixed(1)+'%<small>'+s.successes+' / '+s.n+'</small></strong></div>';}).join('');
 $('benchmark-table').innerHTML=Object.entries(METHODS).map(([m,d])=>{const s=data.summary[m];return '<tr><td><i class="method-dot '+m+'"></i> '+d.label+'</td><td>'+(s.successRate*100).toFixed(1)+'%</td><td>'+s.actions.toFixed(2)+'</td><td>'+s.probes.toFixed(2)+'</td><td>'+s.time.toFixed(2)+' s</td><td>'+(s.error*100).toFixed(2)+' cm</td><td>'+(s.boundaryRate*100).toFixed(1)+'%</td><td>'+s.energy.toFixed(2)+' J</td></tr>';}).join('');
 const a=data.summary.active,p=data.summary.passive,f=data.summary.fixed,delta=a.actions-p.actions;
 $('finding-title').textContent='Learning helps. Probes still have a cost.';
 $('finding-text').textContent='In '+data.n+' runs per strategy, Fixed succeeded '+f.successes+' times, Passive '+p.successes+', and Active '+a.successes+'. Active used '+Math.abs(delta).toFixed(2)+(delta>=0?' more':' fewer')+' moves on average than Passive. Average time was '+a.time.toFixed(2)+' s for Active and '+p.time.toFixed(2)+' s for Passive. These results apply to this test set and move limit. They do not show that probing is always better. No test of statistical significance between strategies was run.';
}
function endBenchmark(){worker?.terminate();worker=null;$('run-benchmark').disabled=false;$('cancel-benchmark').hidden=true;$('benchmark-progress').hidden=true;for(const id of ['suite','sample-count','bench-seed','load-verified'])$(id).disabled=false;}
$('run-benchmark').addEventListener('click',()=>{
 const n=+$('sample-count').value,seed=+$('bench-seed').value,suite=$('suite').value;
 if(!Number.isInteger(seed)||seed<0||seed>4294967295){toast('The test seed must be a whole number from 0 to 4294967295.');return;}
 $('run-benchmark').disabled=true;$('cancel-benchmark').hidden=false;$('benchmark-progress').hidden=false;$('progress').value=0;$('progress-label').textContent='Preparing the same cases for all strategies...';
 for(const id of ['suite','sample-count','bench-seed','load-verified'])$(id).disabled=true;
 try{worker=new Worker('benchmark-worker.js',{type:'module'});}catch(e){endBenchmark();toast('Could not start the background worker: '+e.message);return;}
 worker.onmessage=e=>{if(e.data.type==='progress'){$('progress').value=e.data.value;$('progress-label').textContent='Completed '+e.data.done+' / '+(n*4)+' runs';}else if(e.data.type==='done'){renderBenchmark(e.data.result);endBenchmark();}else if(e.data.type==='error'){endBenchmark();toast(e.data.message);}};
 worker.onerror=e=>{endBenchmark();toast('Benchmark failed: '+e.message);};worker.postMessage({n,seed,suite});
});
$('cancel-benchmark').addEventListener('click',()=>{endBenchmark();toast('Benchmark cancelled. Previous complete results are kept.');});
$('load-verified').addEventListener('click',async()=>{try{const path={uniform:'verified-benchmark.json',shift:'verified-shift.json',mismatch:'verified-mismatch.json'}[$('suite').value],r=await fetch(path);if(!r.ok)throw new Error('Could not load the saved results.');renderBenchmark(await r.json());toast('Loaded 400 saved MuJoCo runs for this case.');}catch(e){toast(e.message);}});
$('export-csv').addEventListener('click',()=>{
 if(!benchmark)return;const keys=['success','boundary','actions','probes','error','time','energy','path','muError','predictionRmse'],header=['scenario','method','engine','suite','seed','mu','start','target','noise',...keys],rows=[header.join(',')];
 for(const m of Object.keys(METHODS))benchmark.episodes[m].forEach((r,i)=>rows.push([i,m,benchmark.engine,benchmark.suite,r.config.seed,r.config.mu,r.config.start,r.config.target,r.config.noise,...keys.map(k=>r.metrics[k])].join(',')));
 download('awm-paired-'+benchmark.engine+'-'+benchmark.seed+'.csv',rows.join('\n'),'text/csv;charset=utf-8');
});
ranges();renderCards();showView(location.hash.slice(1)||'proposal');render();

