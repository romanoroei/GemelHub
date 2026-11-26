import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const config = fs.readFileSync('js/config.js','utf8');
const api = fs.readFileSync('js/api.js','utf8');
const app = fs.readFileSync('js/app.js','utf8');
const html = fs.readFileSync('fund.html','utf8');
new vm.Script(app);
const ctx = vm.createContext({});
vm.runInContext(config + '\n' + api + '\nglobalThis.cfg=CONFIG; globalThis.match=matchInvestmentTrack;',ctx);
const find = html.slice(html.indexOf('function findFundTrack('),html.indexOf('\nfunction buildTrackCompareUrl'));
vm.runInContext(find,ctx);
const cat=ctx.cfg.PRODUCT_CATEGORIES.find(c=>c.id==='hashtalamot');
for (const [id,name,sub,expected] of [
 ['15299','הראל השתלמות עוקב מדדים אג"ח עם מניות','עוקב מדדי אג"ח','okev_agach_maniot25'],
 ['15298','הראל השתלמות עוקב מדדי אג"ח','עוקב מדדי אג"ח','okev_agach'],
 ['99999','עוקב מדדי אג"ח עד 25 % מניות','עוקב מדדי אג"ח','okev_agach_maniot25'],
 ['99998','אג"ח סחיר עד 25% מניות','אג"ח סחיר','agach_sahar_maniot25']
]) {
 const r={FUND_ID:id,FUND_NAME:name,SUB_SPECIALIZATION:sub};
 const matches=ctx.cfg.INVESTMENT_TRACKS.filter(t=>cat.trackList.includes(t.id)&&ctx.match(r,t)).map(t=>t.id);
 assert.deepEqual(Array.from(matches),[expected]); assert.equal(ctx.findFundTrack(r,cat).id,expected);
}
for(const c of ctx.cfg.PRODUCT_CATEGORIES) for(const id of c.trackList||[]) assert.ok(ctx.cfg.INVESTMENT_TRACKS.some(t=>t.id===id),id);
console.log('Shared classification regression checks passed.');
