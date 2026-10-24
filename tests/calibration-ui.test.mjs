import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
const dom=new JSDOM(fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),{url:'https://example.invalid/#calibrate',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.location=dom.window.location;
dom.window.scrollTo=()=>{};dom.window.matchMedia=()=>({matches:false});
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};globalThis.ResizeObserver=class{observe(){}};
dom.window.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:700,height:315});
const context=new Proxy({},{get:(o,k)=>o[k]??(()=>{})});dom.window.HTMLCanvasElement.prototype.getContext=()=>context;
dom.window.HTMLAnchorElement.prototype.click=function(){};
globalThis.fetch=async path=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../dist/'+path,import.meta.url),'utf8'))});
const workers=new Set(),blobs=[];const originalUrl=URL.createObjectURL;
URL.createObjectURL=b=>{blobs.push(b);return 'blob:example';};URL.revokeObjectURL=()=>{};
globalThis.Worker=class{
  constructor(){this.native=new NodeWorker(new URL('./calibration-worker-adapter.mjs',import.meta.url));workers.add(this.native);this.native.on('message',d=>this.onmessage?.({data:d}));this.native.on('error',e=>this.onerror?.(e));}
  postMessage(d){this.native.postMessage(d);}terminate(){this.native.terminate();workers.delete(this.native);}
};
after(()=>{for(const w of workers)w.terminate();URL.createObjectURL=originalUrl;dom.window.close();});
await import('../dist/robot.js');
const $=id=>document.getElementById(id),click=id=>$(id).click();
function change(id,value,type='change'){$(id).value=value;$(id).dispatchEvent(new dom.window.Event(type,{bubbles:true}));}
async function until(p){const start=Date.now();while(!p()){if(Date.now()-start>15000)throw Error('Calibration UI timed out');await new Promise(r=>setTimeout(r,15));}}
async function load(kind){change('cal-sample',kind);click('cal-load');await until(()=>$('cal-load').disabled===false);}
async function fit(){click('cal-fit');await until(()=>$('cal-cancel').hidden);}
function route(hash){location.hash=hash;dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));}

test('calibration is a working route and requires data before fitting',()=>{
  assert.equal($('calibrate-page').hidden,false);assert.equal($('experiment-page').hidden,true);
  assert.equal($('cal-fit').disabled,true);assert.equal($('cal-export').disabled,true);
});
test('synthetic captures keep their source label and fit in a real worker',async()=>{
  await load('matched');assert.match($('cal-source-tag').textContent,/SIMULATED/);
  assert.equal($('cal-source').disabled,true);assert.equal($('cal-confirm').checked,true);
  assert.match($('cal-training-count').textContent,/8 calibration/);assert.match($('cal-validation-count').textContent,/8 validation/);
  await fit();assert.equal($('cal-results').hidden,false);assert.match($('cal-after').textContent,/3.2 mm/);
  assert.equal($('cal-export').disabled,false);assert.equal($('cal-apply').disabled,false);
  assert.match($('cal-track-note').textContent,/VALIDATION/);
  change('cal-trial','trial-001');assert.match($('cal-track-note').textContent,/CALIBRATION/);
});
test('a fitted prior can be tried in A; a world setting change clears that prior',()=>{
  click('cal-apply');dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  assert.equal($('experiment-page').hidden,false);assert.match($('robot-case-note').textContent,/Fitted prior means/);
  change('robot-case','known');assert.equal($('robot-case-note').textContent.includes('Fitted prior'),false);route('#calibrate');
  change('cal-sample','drift');assert.equal($('cal-results').hidden,true);assert.equal($('cal-fit').disabled,true);assert.equal($('cal-export').disabled,true);
});
test('validation drift and weak motion keep their failure diagnostics and block the handoff',async()=>{
  await load('drift');await fit();assert.match($('cal-change').textContent,/higher/);
  assert.match($('cal-diagnostics').textContent,/condition changes/);assert.equal($('cal-apply').disabled,true);
  await load('quiet');await fit();assert.equal($('cal-fit-mu').textContent,'Unclear');
  assert.match($('cal-diagnostics').textContent,/Too little motion/);assert.equal($('cal-apply').disabled,true);
});
test('input edits invalidate reports; cancellation does not expose a stale fitted model',async()=>{
  change('cal-base-mu','','input');assert.equal($('cal-results').hidden,true);assert.equal($('cal-export').disabled,true);
  assert.equal($('cal-fit').disabled,true);change('cal-base-mu','.26','input');click('cal-fit');click('cal-cancel');
  assert.equal($('cal-results').hidden,true);assert.equal($('cal-export').disabled,true);assert.match($('cal-status').textContent,/cancelled/);
});
test('CSV imports are unverified, anonymous, and require the measurement assumptions',async()=>{
  const csv=fs.readFileSync(new URL('../dist/calibration-matched.csv',import.meta.url),'utf8').replaceAll('trial-001','private-label');
  Object.defineProperty($('cal-file'),'files',{configurable:true,value:[{size:csv.length,name:'private-file.csv',text:async()=>csv}]});
  $('cal-file').dispatchEvent(new dom.window.Event('change'));await until(()=>$('cal-load').disabled===false);
  assert.match($('cal-source-tag').textContent,/EXTERNAL \/ UNVERIFIED/);assert.equal($('cal-confirm').checked,false);assert.equal($('cal-fit').disabled,true);
  change('cal-source','declared-physical');assert.match($('cal-source-tag').textContent,/DECLARED PHYSICAL \/ UNVERIFIED/);
  $('cal-confirm').checked=true;$('cal-confirm').dispatchEvent(new dom.window.Event('change'));await fit();
  click('cal-export');const out=JSON.parse(await blobs.at(-1).text());
  assert.equal(out.realWorldVerified,false);assert.equal(out.deploymentApproved,false);assert.equal(JSON.stringify(out).includes('private-'),false);
});
test('a malformed import clears the old dataset and report',async()=>{
  Object.defineProperty($('cal-file'),'files',{configurable:true,value:[{size:10,text:async()=>'bad,data\n1,2\n'}]});
  $('cal-file').dispatchEvent(new dom.window.Event('change'));await until(()=>$('cal-load').disabled===false);
  assert.equal($('cal-results').hidden,true);assert.equal($('cal-fit').disabled,true);assert.equal($('cal-export').disabled,true);assert.match($('cal-error').textContent,/nine columns/);
  click('cal-reset');assert.equal($('cal-error').hidden,true);assert.match($('cal-status').textContent,/cleared/);
});
