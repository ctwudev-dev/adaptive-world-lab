/** Behavioral DOM tests. They do not provide a visual layout check. */
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
const dom=new JSDOM(fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),{url:'https://example.invalid/',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.location=dom.window.location;
dom.window.scrollTo=()=>{};dom.window.matchMedia=()=>({matches:false});
let next=0;const frames=new Map(),workers=new Set();
globalThis.requestAnimationFrame=f=>{frames.set(++next,f);return next;};globalThis.cancelAnimationFrame=i=>frames.delete(i);
globalThis.ResizeObserver=class{observe(){}};
dom.window.HTMLCanvasElement.prototype.getBoundingClientRect=function(){return {width:this.id==='robot-world'?850:300,height:this.id==='robot-world'?410:175};};
const ctx=new Proxy({},{get:(o,k)=>o[k]??(()=>{})});dom.window.HTMLCanvasElement.prototype.getContext=()=>ctx;
globalThis.fetch=async path=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../dist/'+path,import.meta.url),'utf8'))});
globalThis.Worker=class{
  constructor(){this.native=new NodeWorker(new URL('./robot-worker-adapter.mjs',import.meta.url));workers.add(this.native);this.native.on('message',data=>this.onmessage?.({data}));this.native.on('error',e=>this.onerror?.(e));}
  postMessage(d){this.native.postMessage(d);}terminate(){this.native.terminate();workers.delete(this.native);}
};
after(()=>{for(const w of workers)w.terminate();dom.window.close();});
await import('../dist/robot.js');
const $=id=>document.getElementById(id),click=id=>$(id).click();
function change(id,value,type='change'){$(id).value=value;$(id).dispatchEvent(new dom.window.Event(type,{bubbles:true}));}
function drain(){let t=0;for(let i=0;i<400&&frames.size;i++){const pending=[...frames.values()];frames.clear();t+=100;for(const f of pending)f(t);}}
async function until(predicate){const start=Date.now();while(!predicate()){if(Date.now()-start>12000)throw Error('UI result timed out');await new Promise(r=>setTimeout(r,20));}}
function route(hash){location.hash=hash;dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));}

test('default route shows the physics experiment and keeps evaluator values hidden',()=>{
  assert.equal($('experiment-page').hidden,false);assert.equal($('compare-page').hidden,true);
  assert.equal($('robot-truth-line').hidden,true);assert.match($('robot-case-note').textContent,/after two pushes/);
  assert.match($('robot-candidate-note').textContent,/candidate pulses/);
  assert.match($('robot-moves').textContent,/0 \/ 7/);
});
test('step updates the model and log; animation handles a hidden friction change',()=>{
  click('robot-step');assert.equal($('robot-moves').textContent,'1 / 7');assert.match($('robot-log').textContent,/Observed/);
  click('robot-reset');assert.equal($('robot-moves').textContent,'0 / 7');
  click('robot-play');drain();assert.match($('robot-scene-status').textContent,/Target reached/);
  assert.match($('robot-log').textContent,/Reopened/);assert.equal($('robot-step').disabled,true);
  assert.match($('robot-outcomes').textContent,/Budget used/);
});
test('input validation disables stale actions and reset preserves the validation error',()=>{
  change('robot-seed','','input');assert.equal($('robot-play').disabled,true);assert.equal($('robot-export').disabled,true);
  click('robot-reset');assert.equal($('robot-play').disabled,true);assert.match($('robot-input-error').textContent,/seed/);
  change('robot-seed','2026','input');assert.equal($('robot-play').disabled,false);
  change('robot-strategy','fixed');click('robot-step');assert.match($('robot-decision').textContent,/starting belief/);
  change('robot-strategy','active');
});
test('independent MuJoCo recording loads, reports contact, and returns to live settings',async()=>{
  click('robot-load-contact');await until(()=>$('robot-engine-tag').textContent.includes('MUJOCO'));
  click('robot-step');assert.match($('robot-log').textContent,/Contact measured/);
  click('robot-play');drain();assert.match($('robot-scene-status').textContent,/Target reached/);
  change('robot-case','known');assert.match($('robot-engine-tag').textContent,/LIVE/);
  assert.equal($('robot-moves').textContent,'0 / 7');
});
test('saved paired evidence and a real worker batch use separate engine labels',async()=>{
  route('#compare');assert.equal($('compare-page').hidden,false);
  click('robot-compare-contact');await until(()=>$('robot-compare-contact').disabled===false);
  assert.equal($('robot-compare-table').children.length,3);assert.match($('robot-compare-meta').textContent,/N=60/);
  assert.match($('robot-compare-source').textContent,/MUJOCO/);assert.match($('robot-compare-table').textContent,/57\/60/);
  change('robot-count','30');click('robot-compare-run');await until(()=>$('robot-compare-run').disabled===false);
  assert.match($('robot-compare-source').textContent,/BROWSER/);assert.match($('robot-compare-meta').textContent,/N=30/);
  assert.equal($('robot-compare-export').disabled,false);
});
test('cancellation retains completed data; navigation pauses playback',()=>{
  const previous=$('robot-compare-table').textContent;
  click('robot-compare-run');click('robot-compare-cancel');assert.equal($('robot-compare-run').disabled,false);
  assert.equal($('robot-compare-table').textContent,previous);
  route('#experiment');click('robot-play');route('#method');assert.equal($('method-page').hidden,false);
  assert.match($('robot-play').textContent,/Run experiment/);
});
