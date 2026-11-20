import { normalizeLabels, parseArgs } from './sync-issues';

describe('normalizeLabels', () => {
  it('leaves non-effort labels exactly as written', () => {
    expect(
      normalizeLabels(['security', 'help wanted', 'area:onchain']),
    ).toEqual(['security', 'help wanted', 'area:onchain']);
  });

  it('normalizes only exact effort shorthands', () => {
    expect(normalizeLabels(['S', 'XL', 's', 'xl'])).toEqual([
      'effort:S',
      'effort:XL',
    ]);
  });

  it('does not change fully written labels', () => {
    const labels = [
      'security',
      'help wanted',
      'area:onchain',
      'priority:P1',
      'type:bug',
      'effort:S',
    ];
    expect(normalizeLabels(labels)).toEqual(labels);
  });
});

describe('parseArgs', () => {
  it('accepts a positional backlog file', () => {
    expect(parseArgs(['--dry-run', 'BACKLOG.md'])).toMatchObject({
      dryRun: true,
      file: 'BACKLOG.md',
    });
  });

  it('accepts the --file flag', () => {
    expect(parseArgs(['--file', '../BACKLOG.md'])).toMatchObject({
      file: '../BACKLOG.md',
    });
  });
});
