import fs from 'fs';
const s = fs.readFileSync('src/main.ts','utf8');
const re = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
let m, names=[];
while((m=re.exec(s))) names.push(m[1]);
console.log(names.slice(0,50).join('\n'));
