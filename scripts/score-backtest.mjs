import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CLS = 'תגמולים ואישית לפיצויים';
const TRACKS = ['כללי','מניות'];
const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const unwrap = x => Array.isArray(x) ? x : (x.records || x.result?.records || []);

const index = readJson('data/ckan/gemel-1999-2022/_index.json');
const currentPayload = readJson('data/ckan/gemel-current.json');
const y2023Payload = readJson('data/ckan/gemel-2023.json');

const trackByFund = new Map();
for (const [id,v] of Object.entries(index)) {
  if (v?.cls === CLS && TRACKS.includes(v?.sub)) trackByFund.set(String(id), v.sub);
}
for (const r of [...unwrap(y2023Payload), ...unwrap(currentPayload)]) {
  const id = String(r.FUND_ID || '');
  const cls = String(r.FUND_CLASSIFICATION || '');
  const sub = String(r.SUB_SPECIALIZATION || '');
  if (id && cls === CLS && TRACKS.includes(sub)) trackByFund.set(id, sub);
}

let rows = [...unwrap(y2023Payload), ...unwrap(currentPayload)];
for (const id of trackByFund.keys()) {
  const p = path.join(ROOT,'data/ckan/gemel-1999-2022',`${id}.json`);
  if (fs.existsSync(p)) rows.push(...unwrap(JSON.parse(fs.readFileSync(p,'utf8'))));
}
rows = rows.filter(r => trackByFund.has(String(r.FUND_ID || '')));

const dedup = new Map();
for (const r of rows) dedup.set(`${r.FUND_ID}_${r.REPORT_PERIOD}`, r);
rows = [...dedup.values()];

const byTrackFund = new Map(TRACKS.map(t => [t,new Map()]));
for (const r of rows) {
  const fid = String(r.FUND_ID || '');
  const track = trackByFund.get(fid);
  const period = Number(r.REPORT_PERIOD);
  const m = Number(r.MONTHLY_YIELD);
  if (!track || !period || !Number.isFinite(m)) continue;
  const fm = byTrackFund.get(track);
  if (!fm.has(fid)) fm.set(fid,new Map());
  fm.get(fid).set(period,r);
}

function periodsForYear(y){ return Array.from({length:12},(_,i)=>y*100+i+1); }
function compound(records,periods){ let x=1; for(const p of periods){ const v=Number(records.get(p)?.MONTHLY_YIELD); if(!Number.isFinite(v)) return null; x*=1+v/100; } return (x-1)*100; }
function trailing(records,endYear,months){ const ps=[]; let y=endYear,m=12; for(let i=0;i<months;i++){ ps.push(y*100+m); if(--m===0){m=12;y--;} } return compound(records,ps.reverse()); }
function latestSharpe(records,endYear){ for(let m=12;m>=1;m--){ const v=Number(records.get(endYear*100+m)?.SHARPE_RATIO); if(Number.isFinite(v)) return v; } return null; }
function ranks(values,higher=true){ const v=[...values.entries()].filter(([,x])=>Number.isFinite(x)).sort((a,b)=>higher?b[1]-a[1]:a[1]-b[1]); const out=new Map(); const n=v.length; v.forEach(([id],i)=>out.set(id,n>1?((n-i-1)/(n-1))*100:50)); return out; }
function weighted(parts){ let s=0,w=0; for(const [v,wt] of parts){ if(Number.isFinite(v)&&wt>0){s+=v*wt;w+=wt;} } return w?s/w:null; }
function spearman(xs,ys){ const n=xs.length;if(n<3)return null; const rank=a=>{const z=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]);const r=Array(n);z.forEach(([,i],k)=>r[i]=k+1);return r};const rx=rank(xs),ry=rank(ys),mu=(n+1)/2;let num=0,dx=0,dy=0;for(let i=0;i<n;i++){const a=rx[i]-mu,b=ry[i]-mu;num+=a*b;dx+=a*a;dy+=b*b;}return num/Math.sqrt(dx*dy); }

function recencyYearWeights(total,shape){ const base=shape==='equal'?[1,1,1,1,1]:shape==='mild'?[1,1.3,1.6,1.9,2.2]:[1,1.5,2,2.5,3]; const sum=base.reduce((a,b)=>a+b,0); return base.map(x=>x/sum*total); }
export const MODELS={ baseline:{years:[.168,.168,.168,.168,.168],mom:[0,0,0],sharpe:.16} };
for (const consistency of [.45,.50,.55,.60,.65,.70,.75,.80]) {
  for (const momentum of [.10,.15,.20,.25,.30,.35]) {
    for (const sharpe of [.10,.15,.20]) {
      if (Math.abs(consistency+momentum+sharpe-1)>1e-9) continue;
      for (const shape of ['equal','mild','strong']) {
        for (const momShape of ['short','balanced','long']) {
          const mom = momShape==='short'?[.5,.3,.2]:momShape==='balanced'?[.2,.4,.4]:[.1,.3,.6];
          MODELS[`c${Math.round(consistency*100)}_m${Math.round(momentum*100)}_s${Math.round(sharpe*100)}_${shape}_${momShape}`]={
            years:recencyYearWeights(consistency,shape),
            mom:mom.map(x=>x*momentum),
            sharpe
          };
        }
      }
    }
  }
}

export const obs=[];
for(const track of TRACKS){
  const funds=byTrackFund.get(track);
  const yearsAll=[...new Set([...funds.values()].flatMap(rec=>[...rec.keys()].map(p=>Math.floor(p/100))))].sort((a,b)=>a-b);
  for(const Y of yearsAll){
    if(Y<2005) continue;
    const past=[Y-4,Y-3,Y-2,Y-1,Y],future=Y+1;
    const annualMaps=past.map(()=>new Map()),fut=new Map(),m3=new Map(),m6=new Map(),m12=new Map(),sh=new Map();
    for(const [fid,recs] of funds){
      past.forEach((y,i)=>{const v=compound(recs,periodsForYear(y));if(Number.isFinite(v))annualMaps[i].set(fid,v)});
      const fv=compound(recs,periodsForYear(future));if(Number.isFinite(fv))fut.set(fid,fv);
      const a=trailing(recs,Y,3),b=trailing(recs,Y,6),c=trailing(recs,Y,12),sv=latestSharpe(recs,Y);
      if(Number.isFinite(a))m3.set(fid,a);if(Number.isFinite(b))m6.set(fid,b);if(Number.isFinite(c))m12.set(fid,c);if(Number.isFinite(sv))sh.set(fid,sv);
    }
    const eligible=[...funds.keys()].filter(fid=>annualMaps.every(m=>m.has(fid))&&fut.has(fid));
    if(eligible.length<5) continue;
    const keep=m=>new Map([...m].filter(([id])=>eligible.includes(id)));
    const yrPct=annualMaps.map(m=>ranks(keep(m),true)),futPct=ranks(keep(fut),true),p3=ranks(keep(m3),true),p6=ranks(keep(m6),true),p12=ranks(keep(m12),true),psh=ranks(keep(sh),true);
    for(const fid of eligible){
      const scores={};
      for(const [name,model] of Object.entries(MODELS)){
        const parts=[];model.years.forEach((wt,i)=>parts.push([yrPct[i].get(fid),wt]));parts.push([p3.get(fid),model.mom[0]],[p6.get(fid),model.mom[1]],[p12.get(fid),model.mom[2]],[psh.get(fid),model.sharpe]);scores[name]=weighted(parts);
      }
      obs.push({track,year:Y,fundId:fid,futurePct:futPct.get(fid),scores});
    }
  }
}

export function summarize(rows,model){
  const xs=[],ys=[];let selected=0,hit=0,fall=0;const top3=[];const groups=new Map();for(const r of rows){const k=`${r.track}_${r.year}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
  for(const g of groups.values()){g.sort((a,b)=>b.scores[model]-a.scores[model]);const cut=Math.ceil(g.length/3);g.forEach((r,i)=>{xs.push(r.scores[model]);ys.push(r.futurePct);if(i<cut){selected++;if(r.futurePct>=66.6667)hit++;if(r.futurePct<=33.3333)fall++;}if(i<3)top3.push(r.futurePct)})}
  return {n:rows.length,groups:groups.size,spearman:Number((spearman(xs,ys)??0).toFixed(3)),topThirdHitRate:selected?Number((hit/selected*100).toFixed(1)):null,topThirdFallToBottomRate:selected?Number((fall/selected*100).toFixed(1)):null,top3FuturePercentile:top3.length?Number((top3.reduce((a,b)=>a+b,0)/top3.length).toFixed(1)):null};
}

const result={generatedAt:new Date().toISOString(),fundCounts:Object.fromEntries(TRACKS.map(t=>[t,byTrackFund.get(t).size])),years:{},tracks:{},combinedTop20:[]};
for(const track of TRACKS){const rr=obs.filter(r=>r.track===track);result.years[track]=[...new Set(rr.map(r=>r.year))];result.tracks[track]={baseline:summarize(rr,'baseline')};}
const ranked=[];for(const name of Object.keys(MODELS)){const s=summarize(obs,name);ranked.push({model:name,...s});}ranked.sort((a,b)=>(b.spearman-a.spearman)||(b.topThirdHitRate-a.topThirdHitRate)||(b.top3FuturePercentile-a.top3FuturePercentile));
result.combinedTop20=ranked.slice(0,20);
result.bestByTrack={};for(const track of TRACKS){const rr=obs.filter(r=>r.track===track);const list=Object.keys(MODELS).map(name=>({model:name,...summarize(rr,name)})).sort((a,b)=>(b.spearman-a.spearman)||(b.topThirdHitRate-a.topThirdHitRate));result.bestByTrack[track]=list.slice(0,10);}
fs.mkdirSync(path.join(ROOT,'backtest-results'),{recursive:true});fs.writeFileSync(path.join(ROOT,'backtest-results','score-backtest-grid.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
