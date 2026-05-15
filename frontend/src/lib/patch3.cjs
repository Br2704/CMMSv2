const fs = require('fs');
const path = 'd:/CMMSv2/frontend/src/lib/import-template.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace('import { utils, write } from "xlsx";', 'import * as XLSX from "xlsx";');
code = code.replace(/utils\./g, 'XLSX.utils.');
code = code.replace(/\bwrite\(/g, 'XLSX.write(');

fs.writeFileSync(path, code);
console.log('Fixed XLSX imports');
