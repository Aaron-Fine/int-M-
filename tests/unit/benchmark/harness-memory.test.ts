import { describe, expect, it } from 'vitest';
import {
  JS_HEAP_LABEL,
  MEMORY_TABLE_HEADERS,
  RETAINED_LABEL,
  formatMiB,
  memoryRows,
  notMeasured,
  notRecordedMemory,
  summarizeReadings,
  unsupportedEngineMemory,
} from '../../../tools/benchmark/harness/memory.ts';

const MIB = 1024 * 1024;

describe('summarizeReadings', () => {
  it('takes the maximum reading, names its case and counts the samples', () => {
    const figure = summarizeReadings(
      JS_HEAP_LABEL,
      [
        { caseId: 'a', bytes: 10 * MIB },
        { caseId: 'b', bytes: 30 * MIB },
        { caseId: 'c', bytes: 20 * MIB },
      ],
      'none',
    );
    expect(figure).toEqual({
      status: 'measured',
      label: JS_HEAP_LABEL,
      highWaterBytes: 30 * MIB,
      atCaseId: 'b',
      samples: 3,
    });
  });

  it('drops missing, non-finite and negative readings instead of reporting them', () => {
    const figure = summarizeReadings(
      RETAINED_LABEL,
      [
        { caseId: 'nan', bytes: Number.NaN },
        { caseId: 'inf', bytes: Number.POSITIVE_INFINITY },
        { caseId: 'neg', bytes: -5 },
        { caseId: 'ok', bytes: 7 * MIB },
      ],
      'none',
    );
    expect(figure).toMatchObject({
      status: 'measured',
      highWaterBytes: 7 * MIB,
      atCaseId: 'ok',
      samples: 1,
    });
  });

  it('reports "not measured" with the supplied reason when no valid reading remains', () => {
    expect(summarizeReadings(JS_HEAP_LABEL, [], 'page not isolated')).toEqual({
      status: 'not measured',
      reason: 'page not isolated',
    });
    expect(
      summarizeReadings(JS_HEAP_LABEL, [{ caseId: 'x', bytes: Number.NaN }], 'no valid readings'),
    ).toEqual({ status: 'not measured', reason: 'no valid readings' });
  });

  it('keeps zero as a valid reading', () => {
    expect(summarizeReadings(JS_HEAP_LABEL, [{ caseId: 'z', bytes: 0 }], 'none')).toMatchObject({
      status: 'measured',
      highWaterBytes: 0,
    });
  });
});

describe('engine defaults', () => {
  it('records Firefox as not measured for both figures, with a reason and no number', () => {
    const memory = unsupportedEngineMemory('firefox');
    for (const figure of [memory.jsHeap, memory.retained]) {
      expect(figure.status).toBe('not measured');
      expect(JSON.stringify(figure)).not.toMatch(/highWaterBytes/);
      if (figure.status === 'not measured') expect(figure.reason).toMatch(/Firefox/);
    }
  });

  it('marks evidence written before the memory pass as not recorded', () => {
    const memory = notRecordedMemory();
    expect(memory.jsHeap).toEqual(notMeasured('not recorded in this evidence file'));
    expect(memory.retained).toEqual(notMeasured('not recorded in this evidence file'));
  });
});

describe('formatMiB and memoryRows', () => {
  it('formats bytes as MiB with one decimal', () => {
    expect(formatMiB(1.5 * MIB)).toBe('1.5 MiB');
    expect(formatMiB(0)).toBe('0.0 MiB');
  });

  it('renders measured and not-measured figures as table rows matching the headers', () => {
    const rows = memoryRows({
      jsHeap: summarizeReadings(JS_HEAP_LABEL, [{ caseId: 'hard', bytes: 12 * MIB }], 'none'),
      retained: notMeasured('Firefox exposes no memory API'),
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toHaveLength(MEMORY_TABLE_HEADERS.length);
    expect(rows[0]).toEqual([
      'JS heap (main thread)',
      'measured',
      '12.0 MiB',
      'hard',
      '1',
      JS_HEAP_LABEL,
    ]);
    expect(rows[1]).toEqual([
      'Retained after stable (all workers)',
      'not measured',
      'n/a',
      'n/a',
      '0',
      'Firefox exposes no memory API',
    ]);
  });
});
