const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'src'));
let foundIssues = false;

for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const regex = /<([a-zA-Z]+)([^>]*asChild[^>]*)>([\s\S]*?)<\/\1>/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const tagName = match[1];
        const innerContent = match[3].trim();
        
        // If innerContent starts with { and ends with }
        if (innerContent.startsWith('{') && innerContent.endsWith('}')) {
            console.log(`\nFound variable/conditional in ${file}:`);
            console.log(`<${tagName} asChild>`);
            console.log(innerContent);
            console.log(`</${tagName}>`);
            foundIssues = true;
        }
    }
}

if (!foundIssues) {
    console.log("No obvious issues found with asChild.");
}
