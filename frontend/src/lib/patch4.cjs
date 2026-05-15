const fs = require('fs');
const path = 'd:/CMMSv2/frontend/src/lib/import-template.ts';
let code = fs.readFileSync(path, 'utf8');

const refStart = code.indexOf('  // ── REFERENCE SHEET ─────────────────────────────────────────────────────────');
const refEnd = code.indexOf('  // ── WRITE & DOWNLOAD ────────────────────────────────────────────────────────');

const refBlock = code.substring(refStart, refEnd);

// Remove refBlock from original position
code = code.substring(0, refStart) + code.substring(refEnd);

// Insert refBlock BEFORE the Data Validations
const dvStart = code.indexOf('  // Data validations — dropdown lists and date constraints');
code = code.substring(0, dvStart) + refBlock + '\n' + code.substring(dvStart);

fs.writeFileSync(path, code);
console.log('Fixed refColMap TDZ error!');
