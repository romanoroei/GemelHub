import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base=process.env.BASELINE_SHA;
const read=p=>fs.readFileSync(p,'utf8');
function context(config,api,app='') {
 const ctx=vm.createContext({});
 vm.runInContext(config+'\n'+api+'\n globalThis.cfg=CONFIG; globalThis.allowed=isProviderAllowed;',ctx);
 // The baseline app extends the same config after API initialization.
 if(app) {const start=app.indexOf('  (function extendAgachSahirTracks()'); if(start>=0) vm.runInContext(app.slice(start,app.indexOf('\n  })();',start)+9),ctx);}
 return ctx;
}
const current=context(read('js/config.js'),read('js/api.js'));
const old=base?context(...['js/config.js','js/api.js','js/app.js'].map(p=>execFileSync('git',['show',base+':'+p],{encoding:'utf8',maxBuffer:20_000_000}))):null;
function matcher(ctx,isOld) {
 if(!isOld) return (r,t)=>vm.runInContext('matchInvestmentTrack',ctx)(r,t);
 const api=execFileSync('git',['show',base+':js/api.js'],{encoding:'utf8',maxBuffer:20_000_000});
 const start=api.indexOf('  function matchesTrackToken('), end=api.indexOf('\n  // ─── ארגן נתונים',start);
 vm.runInContext(api.slice(start,end)+'\n globalThis.oldMatch=matchTrackBySubSpec;',ctx);
 return ctx.oldMatch;
}
const m=matcher(current,false), om=old&&matcher(old,true);
const families={gemel:'gemel-current.json',pension:'pension-current.json',polisa:'polisa-current.json'};
const latest={};
for(const [key,file] of Object.entries(families)){
 const raw=JSON.parse(read('data/ckan/'+file));const map=new Map();
 for(const r of raw.records){const id=String(r.FUND_ID);if(!map.has(id)||Number(r.REPORT_PERIOD)>Number(map.get(id).REPORT_PERIOD))map.set(id,r);}
 latest[key]=[...map.values()]; assert.ok(map.size>0,key);
}
const result={categories:[],changes:[],unclassified:[],duplicates:[]};
for(const cat of current.cfg.PRODUCT_CATEGORIES.filter(c=>c.trackList)){
 const family=cat.pensionAPI?'pension':cat.polisaAPI?'polisa':'gemel';
 const rows=latest[family].filter(r=>cat.apiClassifications.includes((r.FUND_CLASSIFICATION||'').trim())&&current.allowed(r.CONTROLLING_CORPORATION,r.MANAGING_CORPORATION)&&!String(r.FUND_NAME||'').includes('בניהול אישי')&&!(cat.excludedFundIds||[]).includes(String(r.FUND_ID))&&(family!=='gemel'||r.TARGET_POPULATION==='כלל האוכלוסיה')&&(family!=='polisa'||(!/אקסלנס|משתתף|מקבלי קצבה/.test(r.FUND_NAME||'')&&String(r.FUND_ID)!=='90')));
 const period=Math.max(...rows.map(r=>Number(r.REPORT_PERIOD)));
 const active=rows.filter(r=>Number(r.REPORT_PERIOD)===period);
 const oldcat=old?.cfg.PRODUCT_CATEGORIES.find(c=>c.id===cat.id);
 const tracks=(ctx,c,r,fn)=>ctx.cfg.INVESTMENT_TRACKS.filter(t=>c.trackList.includes(t.id)&&fn(r,t)).map(t=>t.id).sort();
 let missing=0,duplicates=0;
 for(const r of active){
  const ids=tracks(current,cat,r,m);
  const row={category:cat.id,id:String(r.FUND_ID),name:r.FUND_NAME,sub:r.SUB_SPECIALIZATION,tracks:ids};
  if(!ids.length){missing++;result.unclassified.push(row);}
  if(ids.length>1){duplicates++;result.duplicates.push(row);}
  if(old){const previous=tracks(old,oldcat,r,om);if(JSON.stringify(previous)!==JSON.stringify(ids))result.changes.push({...row,previous});}
 }
 result.categories.push({category:cat.id,period,active:active.length,missing,duplicates});
}
console.log(JSON.stringify(result,null,2));
fs.writeFileSync('track-audit-report.json',JSON.stringify(result,null,2));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Track classification audit (read-only)\n\n'+result.categories.map(c=>'- '+c.category+': '+c.active+' active, '+c.missing+' missing, '+c.duplicates+' multiple').join('\n')+'\n\nBaseline membership changes: '+result.changes.length+'\n');
if(old)assert.equal(result.changes.length,0,'unexpected comparison group membership changes');
