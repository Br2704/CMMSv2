const fs = require('fs');
const { SourceMapConsumer } = require('source-map');

async function resolveTrace() {
    const rawSourceMap = fs.readFileSync('dist/assets/vendor-radix-CpStvzS5.js.map', 'utf8');
    const consumer = await new SourceMapConsumer(rawSourceMap);

    const positions = [
        { line: 1, column: 4746 },
        { line: 8, column: 63103 },
        { line: 6, column: 17251 },
        { line: 8, column: 1575 },
        { line: 8, column: 46429 },
        { line: 8, column: 40082 },
        { line: 8, column: 40010 },
        { line: 8, column: 39863 },
        { line: 8, column: 36178 },
        { line: 8, column: 36990 }
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
