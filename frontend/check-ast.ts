import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walk(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'src'));

function checkFile(filePath: string) {
    const sourceFile = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true
    );

    function visit(node: ts.Node) {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
            const openingElement = ts.isJsxElement(node) ? node.openingElement : node;
            const tagName = openingElement.tagName.getText();
            
            const hasAsChild = openingElement.attributes.properties.some(
                attr => ts.isJsxAttribute(attr) && attr.name.getText() === 'asChild'
            );

            if (hasAsChild || tagName === 'FormControl') {
                if (ts.isJsxSelfClosingElement(node)) {
                    console.log(`\nSelf-closing in ${filePath} (Line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}):`);
                    console.log(`${tagName} is self-closing`);
                } else {
                    const children = node.children.filter(child => {
                        if (ts.isJsxText(child)) {
                            return child.getText().trim().length > 0;
                        }
                        if (child.kind === ts.SyntaxKind.JsxExpression && child.getText().trim() === '') {
                             return false;
                        }
                        return true;
                    });
                    
                    if (children.length !== 1) {
                        console.log(`\nIssue in ${filePath} (Line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}):`);
                        console.log(`${tagName} element has ${children.length} children. Expected 1.`);
                    } else if (children[0].kind === ts.SyntaxKind.JsxExpression) {
                        // skip
                    }
                }
            }
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
}

for (const file of files) {
    checkFile(file);
}
