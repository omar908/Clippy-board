import fs from 'fs';
const files=['replace.mjs','replace.js'];
for (const f of files){
  try{
    const s=fs.readFileSync(f,'utf8');
    if(s.includes('D:/Documents')) console.log('bad',f);
    else console.log('ok',f);
  }catch(e){console.log('err',f);}
}
