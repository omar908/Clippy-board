import fs from 'fs';
const s = fs.readFileSync('src/main.ts','utf8');
const idx = s.indexOf('tabHistory');
if(idx>=0){
  console.log(s.slice(idx-60, idx+120));
}
