const fs = require('fs');
const path = require('path');
const { SourceMapConsumer } = require('source-map');

async function main() {
    const assetsDir = 'dist/assets';
    const files = fs.readdirSync(assetsDir);
    const jsFile = files.find(f => f.startsWith('WorkOrders-') && f.endsWith('.js'));
    const mapFile = files.find(f => f.startsWith('WorkOrders-') && f.endsWith('.js.map'));
    if (!jsFile || !mapFile) {
        throw new Error('JS or Map file not found');
    }
    console.log('JS File:', jsFile);
    console.log('Map File:', mapFile);

    const mapPath = path.join(assetsDir, mapFile);
    const rawSourceMap = fs.readFileSync(mapPath, 'utf8');
    const consumer = await new SourceMapConsumer(rawSourceMap);

    // Let's print mappings around column 2282 (or nearby range)
    for (let col = 1000; col <= 5000; col += 100) {
        const orig = consumer.originalPositionFor({
            line: 1,
            column: col
        });
        if (orig.source) {
            console.log(`Col ${col} -> ${orig.source}:${orig.line}:${orig.column} (${orig.name})`);
        }
    }

    consumer.destroy();
}

main().catch(console.error);
