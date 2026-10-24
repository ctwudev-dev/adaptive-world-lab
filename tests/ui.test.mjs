/** DOM interaction checks, not a substitute for visual browser QA. */
import test from 'node:test';
import {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Worker as NodeWorker} from 'node:worker_threads';
import {JSDOM} from 'jsdom';
const html=fs.readFileSync(new URL('../dist/transfer.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://example.invalid/#lab',pretendToBeVisual:true});
const liveTimers=new Set(),nativeTimeout=globalThis.setTimeout;
globalThis.setTimeout=(fn,ms,...args)=>{const timer=nativeTimeout(fn,ms,...args);liveTimers.add(timer);return timer;};
after(()=>{for(const timer of liveTimers)clearTimeout(timer);dom.window.close();});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.location=dom.window.location;
dom.window.scrollTo=()=>{};
let id=0;const frames=new Map();
globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};
globalThis.cancelAnimationFrame=frame=>frames.delete(frame);
globalThis.ResizeObserver=class{constructor(callback){this.callback=callback;}observe(){}};
dom.window.HTMLCanvasElement.prototype.getBoundingClientRect=function(){return{width:this.id==='world'?700:400,height:this.id==='world'?291:125};};
const context=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
dom.window.HTMLCanvasElement.prototype.getContext=()=>context;
globalThis.fetch=async path=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(new URL('../dist/'+path,import.meta.url),'utf8'))});
globalThis.Worker=class{
 constructor(){
  this.native=new NodeWorker(new URL('./worker-adapter.mjs',import.meta.url));
  this.native.on('message',data=>this.onmessage?.({data}));
  this.native.on('error',error=>this.onerror?.(error));
 }
 postMessage(data){this.native.postMessage(data);}
 terminate(){this.native.terminate();}
};
await import('../dist/app.js');
const $=id=>document.getElementById(id);
function click(id){$(id).click();}
function change(id,value,type='input'){$(id).value=value;$(id).dispatchEvent(new dom.window.Event(type,{bubbles:true}));}
function drainFrames(){
 let time=0;
 for(let i=0;i<150&&frames.size;i++){
  const pending=[...frames.values()];frames.clear();time+=1000;for(const f of pending)f(time);
 }
}
async function until(predicate,ms=8000){const start=Date.now();while(!predicate()){if(Date.now()-start>ms)throw new Error('UI event timed out');await new Promise(r=>setTimeout(r,20));}}


test('business view exposes assumptions, downside cases, invalid input, and station navigation', async () => {
 location.hash = '';
 dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
 assert.equal($('proposal-view').hidden, false);
 document.querySelector('.topbar [data-view="proposal"]').click();
 dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
 assert.equal($('proposal-view').hidden, false);
 assert.equal($('lab-view').hidden, true);
 assert.match($('case-net').textContent, /46,600/);
 assert.match($('case-status').textContent, /Meets/);
 change('case-scenario', 'downside', 'change');
 assert.match($('case-net').textContent, /25,400/);
 assert.match($('case-payback').textContent, /No payback/);
 assert.match($('case-status').textContent, /No financial payback/);
 change('case-annualTransfers', '', 'input');
 assert.equal($('case-export').disabled, true);
 assert.equal($('case-input-error').hidden, false);
 assert.equal($('case-net').textContent, '—');
 click('case-reset');
 assert.equal($('case-export').disabled, false);
 await until(() => $('business-evidence').children.length === 3);
 assert.match($('business-evidence-note').textContent, /not production exception rates/);
 document.querySelector('.topbar [data-view="lab"]').click();
 dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
 assert.equal($('lab-view').hidden, false);
});

test('lab supports step, reset, animation completion, and a counterexample',()=>{
 assert.equal($('metric-actions').textContent.trim(),'0 / 6');
 click('step');assert.equal($('metric-actions').textContent.trim(),'1 / 6');
 assert.match($('event-log').textContent,/Probe/);
 click('step');assert.match($('scene-status').textContent,/Target reached/);
 assert.match($('result-cards').textContent,/Out of bounds/);
 click('reset');assert.equal($('metric-actions').textContent.trim(),'0 / 6');
 click('run');drainFrames();assert.match($('scene-status').textContent,/Target reached/);
 change('preset','moderate','change');assert.equal($('mu-value').textContent,'0.16');
 document.querySelector('[data-method="passive"]').click();click('step');
 assert.match($('scene-status').textContent,/Target reached/);
 assert.equal($('metric-actions').textContent.trim(),'1 / 6');
});
test('recorded MuJoCo trajectories load and replay using the same controls',async()=>{
 click('mujoco-load');await until(()=>$('engine-badge').textContent.includes('MuJoCo'));
 assert.equal($('metric-actions').textContent.trim(),'0 / 6');
 document.querySelector('[data-method="active"]').click();click('run');drainFrames();
 assert.match($('scene-status').textContent,/Target reached/);
 assert.equal($('metric-actions').textContent.trim(),'2 / 6');
 change('noise','4');assert.match($('engine-badge').textContent,/live/);
});
test('full worker benchmark uses actual calculations and can load verified data',async()=>{
 document.querySelector('[data-view="benchmark"]').click();dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
 assert.equal($('benchmark-view').hidden,false);
 change('sample-count','40','change');click('run-benchmark');
 await until(()=>$('run-benchmark').disabled===false);
 assert.equal($('benchmark-results').hidden,false);
 assert.equal($('benchmark-table').children.length,4);
 assert.match($('bench-meta').textContent,/N=40/);
 click('load-verified');await until(()=>$('bench-meta').textContent.includes('MuJoCo'));
 assert.match($('benchmark-table').textContent,/99.0%/);
 assert.match($('benchmark-table').textContent,/100.0%/);
});
test('benchmark cancellation cleans up worker and retains completed results',()=>{
 click('run-benchmark');assert.equal($('run-benchmark').disabled,true);click('cancel-benchmark');
 assert.equal($('run-benchmark').disabled,false);assert.equal($('cancel-benchmark').hidden,true);
 assert.equal($('benchmark-results').hidden,false);
});

