const fs = require('fs');
const path = require('path');
const { SourceMapConsumer } = require('source-map');

async function main() {
    const assetsDir = 'dist/assets';
    const files = fs.readdirSync(assetsDir);
    const mapFile = files.find(f => f.startsWith('WorkOrders-') && f.endsWith('.js.map'));
    if (!mapFile) {
        throw new Error('No WorkOrders map file found in ' + assetsDir);
    }
    const mapPath = path.join(assetsDir, mapFile);
    console.log('Using map file:', mapPath);
    
    const rawSourceMap = fs.readFileSync(mapPath, 'utf8');
    const consumer = await new SourceMapConsumer(rawSourceMap);

    const orig = consumer.originalPositionFor({
        line: 1,
        column: 2282
    });
    console.log(`Resolved: ${orig.source}:${orig.line}:${orig.column} (${orig.name})`);

    // Let's also print around column 2282
    console.log('--- Context ---');
    for (let c = 2250; c <= 2310; c++) {
        const o = consumer.originalPositionFor({ line: 1, column: c });
        if (o.source) {
            console.log(`Col ${c} -> ${o.source}:${o.line}:${o.column} (${o.name})`);
        }
    }
}

main().catch(console.error);
