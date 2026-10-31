const fs = require('fs');
const path = 'D:/Documents/Coding/Rust/clippy/src/main.ts';
let s = fs.readFileSync(path, 'utf8');
let changed = false;
s = s.replace(/document\.getElementById\('([^']+)'\)/g, function(m, p1){ changed = true; return "getEl('" + p1 + "')"; });
s = s.replace(/document\.getElementById\("([^"]+)"\)/g, function(m, p1){ changed = true; return 'getEl("' + p1 + '")'; });
if (changed){ fs.writeFileSync(path, s); console.log('done'); } else { console.log('none'); }
