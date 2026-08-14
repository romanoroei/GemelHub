import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CLS = 'תגמולים ואישית לפיצויים';
const TRACKS = ['כללי','מניות'];

const readJson = p => JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const index = readJson('data/ckan/gemel-1999-2022/_index.json');
const currentPayload = readJson('data/ckan/gemel-current.json');
const y2023Payload = readJson('data/ckan/gemel-2023.json');
const unwrap = x => Array.isArray(x) ? x : (x.records || x.result?.records || []);

const relevantIds = Object.entries(index)
  .filter(([,v]) => v?.cls === CLS && TRACKS.includes(v?.sub))
  .map(([id]) => id);

let rows = [...unwrap(currentPayload), ...unwrap(y2023Payload)];
for (const id of relevantIds) {
  const p = path.join(ROOT,'data/ckan/gemel-1999-2022',`${id}.json`);
  if (fs.existsSync(p)) rows.push(...unwrap(JSON.parse(fs.readFileSync(p,'utf8'))));
}

rows = rows.filter(r => String(r.FUND_CLASSIFICATION||'') === CLS && TRACKS.includes(String(r.SUB_SPECIALIZATION||'')));

// Deduplicate fund-period, preferring later-loaded/current rows.
const dedup = new Map();
for (const r of rows) dedup.set(`${r.FUND_ID}_${r.REPORT_PERIOD}`, r);
rows = [...dedup.values()];

const byTrackFund = new Map();
for (const r of rows) {
  const track = String(r.SUB_SPECIALIZATION||'');
  const fid = String(r.FUND_ID||'');
  const period = Number(r.REPORT_PERIOD);
  const m = Number(r.MONTHLY_YIELD);
  if (!track || !fid || !period || !Number.isFinite(m)) continue;
  if (!byTrackFund.has(track)) byTrackFund.set(track,new Map());
  const fm = byTrackFund.get(track);
  if (!fm.has(fid)) fm.set(fid,new Map());
  fm.get(fid).set(period,r);
}

function periodsForYear(y){ return Array.from({length:12},(_,i)=>y*100+i+1); }
function compound(records, periods){
  let x=1;
  for(const p of periods){ const r=records.get(p); const m=Number(r?.MONTHLY_YIELD); if(!Number.isFinite(m)) return null; x*=1+m/100; }
  return (x-1)*100;
}
function trailing(records,endYear,months){
  const periods=[]; let y=endYear, m=12;
  for(let i=0;i<months;i++){ periods.push(y*100+m); m--; if(m===0){m=12;y--;} }
  periods.reverse();
  return compound(records,periods);
}
function downside36(records,endYear){
  const vals=[]; let y=endYear,m=12;
  for(let i=0;i<36;i++){ const r=records.get(y*100+m); const v=Number(r?.MONTHLY_YIELD); if(!Number.isFinite(v)) return null; vals.push(Math.min(0,v)); m--; if(m===0){m=12;y--;} }
  const rms=Math.sqrt(vals.reduce((s,v)=>s+v*v,0)/vals.length)*Math.sqrt(12);
  return rms;
}
function latestSharpe(records,endYear){
  for(let m=12;m>=1;m--){ const r=records.get(endYear*100+m); const v=Number(r?.SHARPE_RATIO); if(Number.isFinite(v)) return v; }
  return null;
}
function ranks(values,higher=true){
  const valid=[...values.entries()].filter(([,v])=>Number.isFinite(v)).sort((a,b)=>higher?b[1]-a[1]:a[1]-b[1]);
  const out=new Map(); const n=valid.length;
  valid.forEach(([id],i)=>out.set(id,n>1?((n-i-1)/(n-1))*100:50));
  return out;
}
function weighted(parts){ let s=0,w=0; for(const [v,wt] of parts){ if(Number.isFinite(v)&&wt>0){s+=v*wt;w+=wt;} } return w?s/w:null; }
function spearman(xs,ys){
  const n=xs.length;if(n<3)return null;
  const rank=a=>{ const idx=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]); const r=Array(n); idx.forEach(([,i],k)=>r[i]=k+1); return r; };
  const rx=rank(xs),ry=rank(ys),mx=(n+1)/2,my=mx;
  let num=0,dx=0,dy=0; for(let i=0;i<n;i++){const a=rx[i]-mx,b=ry[i]-my;num+=a*b;dx+=a*a;dy+=b*b;} return num/Math.sqrt(dx*dy);
}

const MODELS={
  baseline:{years:[.168,.168,.168,.168,.168],mom:[0,0,0],sharpe:.16,down:0},
  recency_60_mom25_sh15:{years:[.06,.09,.12,.15,.18],mom:[.05,.10,.10],sharpe:.15,down:0},
  recency_55_mom25_sh15_down5:{years:[.07,.09,.11,.13,.15],mom:[.05,.10,.10],sharpe:.15,down:.05},
  recency_65_mom20_sh15:{years:[.07,.10,.13,.16,.19],mom:[.04,.08,.08],sharpe:.15,down:0},
  equal55_mom30_sh15:{years:[.11,.11,.11,.11,.11],mom:[.05,.10,.15],sharpe:.15,down:0}
};

const obs=[];
for(const track of TRACKS){
  const funds=byTrackFund.get(track)||new Map();
  const yearsAll=[...new Set([...funds.values()].flatMap(rec=>[...rec.keys()].map(p=>Math.floor(p/100))))].sort((a,b)=>a-b);
  for(const Y of yearsAll){
    if(Y<2005) continue;
    const past=[Y-4,Y-3,Y-2,Y-1,Y], future=Y+1;
    const annualMaps=past.map(y=>new Map()); const fut=new Map(),m3=new Map(),m6=new Map(),m12=new Map(),sh=new Map(),down=new Map();
    for(const [fid,recs] of funds){
      past.forEach((y,i)=>{const v=compound(recs,periodsForYear(y)); if(Number.isFinite(v)) annualMaps[i].set(fid,v);});
      const fv=compound(recs,periodsForYear(future)); if(Number.isFinite(fv)) fut.set(fid,fv);
      const a=trailing(recs,Y,3),b=trailing(recs,Y,6),c=trailing(recs,Y,12),sv=latestSharpe(recs,Y),dv=downside36(recs,Y);
      if(Number.isFinite(a))m3.set(fid,a); if(Number.isFinite(b))m6.set(fid,b); if(Number.isFinite(c))m12.set(fid,c); if(Number.isFinite(sv))sh.set(fid,sv); if(Number.isFinite(dv))down.set(fid,dv);
    }
    const eligible=[...funds.keys()].filter(fid=>annualMaps.every(m=>m.has(fid))&&fut.has(fid));
    if(eligible.length<5) continue;
    const keep=m=>new Map([...m].filter(([id])=>eligible.includes(id)));
    const yrPct=annualMaps.map(m=>ranks(keep(m),true));
    const futPct=ranks(keep(fut),true), p3=ranks(keep(m3),true),p6=ranks(keep(m6),true),p12=ranks(keep(m12),true),psh=ranks(keep(sh),true),pdown=ranks(keep(down),false);
    for(const fid of eligible){
      const scores={};
      for(const [name,model] of Object.entries(MODELS)){
        const parts=[];
        model.years.forEach((wt,i)=>parts.push([yrPct[i].get(fid),wt]));
        parts.push([p3.get(fid),model.mom[0]],[p6.get(fid),model.mom[1]],[p12.get(fid),model.mom[2]],[psh.get(fid),model.sharpe],[pdown.get(fid),model.down]);
        scores[name]=weighted(parts);
      }
      obs.push({track,year:Y,fundId:fid,futurePct:futPct.get(fid),futureReturn:fut.get(fid),scores});
    }
  }
}

function summarize(rows,model){
  const xs=[],ys=[]; let selected=0,hit=0,fall=0; const top3=[];
  const groups=new Map(); for(const r of rows){const k=`${r.track}_${r.year}`; if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
  for(const g of groups.values()){
    g.sort((a,b)=>b.scores[model]-a.scores[model]);
    const n=g.length,cut=Math.ceil(n/3);
    g.forEach((r,i)=>{xs.push(r.scores[model]);ys.push(r.futurePct);if(i<cut){selected++;if(r.futurePct>=100*(2/3))hit++;if(r.futurePct<=100*(1/3))fall++;}if(i<3)top3.push(r.futurePct);});
  }
  return {n:rows.length,groups:groups.size,spearman:Number(spearman(xs,ys)?.toFixed(3)),topThirdHitRate:Number((hit/selected*100).toFixed(1)),topThirdFallToBottomRate:Number((fall/selected*100).toFixed(1)),top3FuturePercentile:Number((top3.reduce((a,b)=>a+b,0)/top3.length).toFixed(1))};
}

const result={generatedAt:new Date().toISOString(),tracks:{},combined:{},years:{}};
for(const track of TRACKS){ const rr=obs.filter(r=>r.track===track); result.tracks[track]={}; for(const m of Object.keys(MODELS)) result.tracks[track][m]=summarize(rr,m); result.years[track]=[...new Set(rr.map(r=>r.year))]; }
for(const m of Object.keys(MODELS)) result.combined[m]=summarize(obs,m);
fs.mkdirSync(path.join(ROOT,'backtest-results'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'backtest-results','score-backtest.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
