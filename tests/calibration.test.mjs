import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseTracksCsv,validateDataset,calibrate,exportCalibration,toTracksCsv,predictTrack,BASELINE,COLUMNS} from '../dist/calibration-engine.js';
const fixture=kind=>JSON.parse(fs.readFileSync(new URL('../dist/calibration-'+kind+'.json',import.meta.url),'utf8')).dataset;
const matched=fixture('matched');

test('CSV round trip keeps SI measurements and normalizes original trial labels',()=>{
  const csv=toTracksCsv(matched).replaceAll('trial-001','private-customer-label');
  const d=parseTracksCsv('\uFEFF'+csv.replaceAll('\n','\r\n'));
  assert.equal(d.source,'external-unverified');assert.equal(d.trials.length,16);
  assert.equal(d.trials[0].id,'trial-001');assert.equal(JSON.stringify(d).includes('private-customer-label'),false);
  assert.deepEqual(d.trials[0].samples,matched.trials[0].samples);
});
test('parser rejects missing, extra, duplicate, and non-SI columns or values',()=>{
  const csv=toTracksCsv(matched);
  assert.throws(()=>parseTracksCsv(csv.replace('x_m','x_mm')));
  assert.throws(()=>parseTracksCsv(csv.replace('split,','trial_id,')));
  assert.throws(()=>parseTracksCsv(csv.replace(COLUMNS.join(','),COLUMNS.join(',')+',contact')));
  assert.throws(()=>parseTracksCsv(csv.replace('calibration,0,','calibration,NaN,')));
  assert.throws(()=>parseTracksCsv(csv.replace('calibration,0,','calibration,,')));
});
test('a trial cannot leak frames into both splits or change force midway',()=>{
  const csv=toTracksCsv(matched),rows=csv.trim().split('\n');
  const fields=rows[2].split(',');fields[1]='validation';rows[2]=fields.join(',');
  assert.throws(()=>parseTracksCsv(rows.join('\n')),/one split/);
  const d=structuredClone(matched);d.trials=d.trials.filter(t=>t.split==='calibration');
  assert.throws(()=>validateDataset(d),/separate validation trials/);
  const duplicated=structuredClone(matched);duplicated.trials[8]={...structuredClone(duplicated.trials[0]),split:'validation',id:'different-label'};
  assert.throws(()=>validateDataset(duplicated),/duplicated in validation/);
});
test('time order, phase coverage, direction, and recording limits are checked',()=>{
  for(const mutate of [d=>{d.trials[0].samples[0].t=.1;},d=>{d.trials[0].samples[2].t=0;},
    d=>{d.trials[0].command.ux=2;},d=>{d.trials[0].samples[1].x=500;},
    d=>{d.trials[0].samples=d.trials[0].samples.slice(0,4);},d=>{d.source='verified-real';}]){
    const d=structuredClone(matched);mutate(d);assert.throws(()=>validateDataset(d));
  }
});
test('independent contact tracks support useful parameter recovery and held-out prediction',()=>{
  const r=calibrate(matched,BASELINE,true);
  assert.ok(Math.abs(r.parameters.mu-.37)<.05);assert.ok(Math.abs(r.parameters.mass-1.05)<.08);
  assert.ok(r.after.validation.rmse<.006);assert.ok(r.after.validation.rmse<r.before.validation.rmse*.1);
  assert.equal(r.identification.identifiable,true);assert.equal(r.search.calibrationTrials,8);assert.equal(r.search.validationTrials,8);
});
test('validation positions cannot change fitted parameters, landscape, or identification diagnostics',()=>{
  const original=calibrate(matched,BASELINE,true),changed=structuredClone(matched);
  for(const t of changed.trials.filter(t=>t.split==='validation'))for(const [i,p]of t.samples.entries()){p.x+=i*.01;p.y-=i*.005;}
  const r=calibrate(changed,BASELINE,true);
  assert.deepEqual(r.parameters,original.parameters);assert.deepEqual(r.landscape,original.landscape);
  assert.deepEqual(r.identification,original.identification);assert.notEqual(r.after.validation.rmse,original.after.validation.rmse);
  assert.equal(r.search.validationUsedForFit,false);
});
test('the baseline is a comparison and cannot steer the fit',()=>{
  const a=calibrate(matched,BASELINE,true),b=calibrate(matched,{mu:.5,mass:1.3},true);
  assert.deepEqual(a.parameters,b.parameters);assert.deepEqual(a.after,b.after);assert.notEqual(a.before.validation.rmse,b.before.validation.rmse);
});
test('a changed validation surface can make the calibrated model worse',()=>{
  const a=calibrate(matched,BASELINE,true),b=calibrate(fixture('drift'),BASELINE,true);
  assert.deepEqual(a.parameters,b.parameters);assert.ok(b.after.validation.rmse>b.before.validation.rmse*2);
  assert.equal(b.validation.improved,false);assert.ok(b.diagnostics.some(x=>x.code==='validation-gap'));
});
test('quiet data does not produce an identified model or physical approval',()=>{
  const r=calibrate(fixture('quiet'),BASELINE,true);
  assert.equal(r.identification.identifiable,false);assert.ok(r.diagnostics.some(x=>x.code==='low-motion'));
  assert.ok(r.diagnostics.some(x=>x.code==='weak-identification'));
  assert.equal(r.realWorldVerified,false);assert.equal(r.deploymentApproved,false);
});
test('model and dataset assumptions require explicit confirmation',()=>{
  assert.throws(()=>calibrate(matched),/Confirm/);
  assert.throws(()=>calibrate(matched,{mu:.01,mass:.75},true));
});
test('validation RMSE gives equal weight to trials with different sample counts',()=>{
  const d=structuredClone(matched);d.trials[8].samples=d.trials[8].samples.filter((_,i)=>i%2===0);
  const r=calibrate(d,BASELINE,true),rows=r.trials.filter(t=>t.split==='validation');
  const expected=Math.sqrt(rows.reduce((s,t)=>s+t.afterRmse**2,0)/rows.length);
  assert.ok(Math.abs(expected-r.after.validation.rmse)<1e-12);
});
test('off-axis observations count in errors even though the chart uses a projection',()=>{
  const d=structuredClone(matched);
  for(const t of d.trials.filter(t=>t.split==='validation'))for(const [i,p]of t.samples.entries()){p.x-=t.command.uy*i*.001;p.y+=t.command.ux*i*.001;}
  const r=calibrate(d,BASELINE,true);
  assert.ok(r.after.validation.lateralRmse>.01);assert.ok(r.diagnostics.some(x=>x.code==='lateral-motion'));
});
test('reports omit raw positions, input names and extra fields; source declarations never approve deployment',()=>{
  const d=validateDataset({...matched,source:'declared-physical',fileName:'private-name.csv',realWorldVerified:true});
  const r=calibrate(d,BASELINE,true);r.fileName='private-name.csv';r.realWorldVerified=true;r.deploymentApproved=true;
  const out=exportCalibration(r),text=JSON.stringify(out);
  assert.equal(out.realWorldVerified,false);assert.equal(out.deploymentApproved,false);
  assert.equal(text.includes('private-name'),false);assert.equal('landscape'in out,false);assert.equal('samples'in out.trials[0],true);
  assert.equal('positions'in out,false);assert.equal(out.source,'declared-physical');
});
test('quoted original labels cannot become spreadsheet formulas in anonymous exports',()=>{
  const csv=toTracksCsv(matched).replaceAll('trial-001','"=formula,private"');
  const d=parseTracksCsv(csv),out=toTracksCsv(d);
  assert.equal(out.includes('formula'),false);assert.equal(out.includes('private'),false);assert.match(out,/trial-001/);
});
test('trajectory predictions remain anchored to the measured starting position',()=>{
  const t=matched.trials[0],points=predictTrack(BASELINE,t);
  assert.deepEqual(points[0],t.samples[0]);assert.ok(points.every(p=>[p.t,p.x,p.y].every(Number.isFinite)));
});
