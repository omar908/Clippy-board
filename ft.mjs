import fs from 'fs';
const s = fs.readFileSync('src/main.ts','utf8');
console.log(s.split('filterTabs').length-1);
