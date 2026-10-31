import fs from 'fs';
const path = 'src/main.ts';
let s = fs.readFileSync(path,'utf8');
const start = s.indexOf('function formatTime');
if(start === -1){ console.log('no'); process.exit(0); }
const end = s.indexOf('\nfunction ', s.indexOf('function formatTTL') + 20);
if(end === -1){ console.log('no2'); process.exit(0); }
s = s.slice(0,start) + s.slice(end+1);
fs.writeFileSync(path,s);
console.log('done');
