import fs from 'fs';
const s = fs.readFileSync('src/main.ts','utf8');
const i = s.indexOf('cycleFilterTab');
console.log(i);
if(i>=0) console.log(s.slice(i-15,i+80));
