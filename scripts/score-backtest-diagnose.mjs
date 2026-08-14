import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const idx = JSON.parse(fs.readFileSync(path.join(ROOT,'data/ckan/gemel-1999-2022/_index.json'),'utf8'));
const counts = new Map();
for (const [,v] of Object.entries(idx)) {
  const cls = String(v?.cls || '');
  const sub = String(v?.sub || '');
  if (!cls.includes('תגמולים') && !cls.includes('אישית לפיצויים')) continue;
  counts.set(`${cls} || ${sub}`, (counts.get(`${cls} || ${sub}`)||0)+1);
}
const rows = [...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([key,count])=>({key,count}));
fs.mkdirSync(path.join(ROOT,'backtest-results'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'backtest-results','classification-diagnostics.json'),JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows.filter(r=>r.key.includes('מניות')||r.key.includes('כללי')),null,2));
