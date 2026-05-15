const fs = require('fs'); 
const path = require('path'); 
function walk(dir) { 
  let results = []; 
  const list = fs.readdirSync(dir); 
  list.forEach(file => { 
    file = path.resolve(dir, file); 
    const stat = fs.statSync(file); 
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file)); 
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) { 
      results.push(file); 
    } 
  }); 
  return results; 
} 
const files = walk('d:/CMMSv2/frontend/src'); 
let missing = []; 
files.forEach(file => { 
  const content = fs.readFileSync(file, 'utf-8'); 
  if (content.includes('toast.') || content.includes('toast(')) { 
    if (!content.includes('import { toast }') && !content.includes('import { toast,') && !content.includes('export { useToast, toast }')) { 
      missing.push(file); 
      fs.writeFileSync(file, 'import { toast } from "sonner";\n' + content); 
    } 
  } 
}); 
console.log('Added toast import to:', missing);
