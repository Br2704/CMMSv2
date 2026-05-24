const fs = require('fs');
const path = require('path');
const { SourceMapConsumer } = require('source-map');

async function resolveTrace() {
    const assetsDir = 'dist/assets';
    const files = fs.readdirSync(assetsDir);
    const mapFile = files.find(f => f.startsWith('vendor-radix-') && f.endsWith('.js.map'));
    if (!mapFile) {
        throw new Error('No vendor-radix map file found in ' + assetsDir);
    }
    const mapPath = path.join(assetsDir, mapFile);
    console.log('Using map file:', mapPath);
    
    const rawSourceMap = fs.readFileSync(mapPath, 'utf8');
    const consumer = await new SourceMapConsumer(rawSourceMap);

    const positions = [
        { line: 8, column: 128382 },
        { line: 48, column: 8804 },
        { line: 48, column: 8200 },
        { line: 8, column: 68271 },
        { line: 48, column: 7426 },
        { line: 48, column: 6629 },
        { line: 48, column: 5869 }
    ];

    for (const pos of positions) {
        const orig = consumer.originalPositionFor({
            line: pos.line,
            column: pos.column
        });
        console.log(`Line ${pos.line}:${pos.column} -> ${orig.source}:${orig.line}:${orig.column} (${orig.name})`);
    }

    consumer.destroy();
}

resolveTrace().catch(console.error);
