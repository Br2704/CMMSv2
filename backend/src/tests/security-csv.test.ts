import { toCsv } from '../utils/csvExport';

describe('csv export hardening', () => {
  it('neutralizes spreadsheet formula prefixes', () => {
    const csv = toCsv(['name'], [['=HYPERLINK("https://attacker.example","click")']]);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("'=HYPERLINK");
  });
});
