const fs = require('fs');
const content = fs.readFileSync('dist/assets/vendor-radix-CpStvzS5.js', 'utf8');
const lines = content.split('\n');
const line8 = lines[7]; // 0-indexed, so line 8 is index 7
if (line8) {
    const start = Math.max(0, 63103 - 100);
    const end = Math.min(line8.length, 63103 + 100);
    console.log(line8.substring(start, end));
} else {
    console.log("No line 8");
}
