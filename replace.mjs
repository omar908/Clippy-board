import fs from 'fs';
import path from 'path';
const filePath = path.resolve('src/main.ts');
let s = fs.readFileSync(filePath, 'utf8');
let changed = false;
s = s.replace(/document\.getElementById\('([^']+)'\)/g, (m, p1) => { changed = true; return "getEl('" + p1 + "')"; });
s = s.replace(/document\.getElementById\("([^"]+)"\)/g, (m, p1) => { changed = true; return 'getEl("' + p1 + '")'; });
if (changed){ fs.writeFileSync(filePath, s); console.log('done'); } else { console.log('none'); }
