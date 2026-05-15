const fs = require('fs');
const path = 'd:/CMMSv2/frontend/src/lib/import-template.ts';
let code = fs.readFileSync(path, 'utf8');

// remove inline import
code = code.replace(/import\s+\{\s*utils,\s*write\s*\}\s*from\s*"xlsx";/g, '');

// add to top
if (!code.includes('import { utils, write } from "xlsx";')) {
  code = 'import { utils, write } from "xlsx";\n' + code;
}

fs.writeFileSync(path, code);
console.log('fixed import');
