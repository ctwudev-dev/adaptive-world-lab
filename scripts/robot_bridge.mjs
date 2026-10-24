/** Line-based bridge. The independent contact harness sends only controller inputs. */
import readline from 'node:readline';
import {initialController,plan,updateController,finishEpisode} from '../dist/robot-engine.js';
for await (const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})) {
  try {
    const r=JSON.parse(line);let value;
    if(r.operation==='initial')value=initialController(r.config,r.method);
    else if(r.operation==='plan')value=plan(r.state);
    else if(r.operation==='update')value=updateController(r.state,r.action,r.observation);
    else if(r.operation==='finish')value=finishEpisode(r.config,r.method,r.events,r.state,r.position,r.engine);
    else throw Error('Unknown bridge operation.');
    process.stdout.write(JSON.stringify({ok:true,value})+'\n');
  } catch(error) {process.stdout.write(JSON.stringify({ok:false,error:error.message})+'\n');}
}
