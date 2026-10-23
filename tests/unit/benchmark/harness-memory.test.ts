import { describe, expect, it } from 'vitest';
import {
  JS_HEAP_LABEL,
  MEMORY_TABLE_HEADERS,
  RETAINED_LABEL,
  formatMiB,
  memoryPassFailure,
  memoryRows,
  notMeasured,
  isMemorySkipped,
  notRecordedMemory,
  skippedMemory,
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

  it('never reports a maximum over only some cases: an invalid reading makes the figure not measured', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const figure = summarizeReadings(
        RETAINED_LABEL,
        [
          { caseId: 'bad', bytes: bad },
          { caseId: 'ok', bytes: 7 * MIB },
        ],
        'API unavailable',
      );
      expect(figure.status).toBe('not measured');
      expect(figure.status === 'not measured' && figure.reason).toContain('1 of 2 cases');
      expect(JSON.stringify(figure)).not.toMatch(/highWaterBytes/);
    }
  });

  it('treats a case with no reading at all as a failure when the case count is given', () => {
    const readings = [
      { caseId: 'a', bytes: 5 * MIB },
      { caseId: 'b', bytes: 6 * MIB },
    ];
    const partial = summarizeReadings(JS_HEAP_LABEL, readings, 'none', 3);
    expect(partial.status).toBe('not measured');
    expect(partial.status === 'not measured' && partial.reason).toContain('2 of 3 cases');
    expect(summarizeReadings(JS_HEAP_LABEL, readings, 'none', 2)).toMatchObject({
      status: 'measured',
      highWaterBytes: 6 * MIB,
      samples: 2,
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

describe('skipped memory pass', () => {
  it('is recognizable as skipped and distinct from other not-measured figures', () => {
    const memory = skippedMemory();
    expect(memory.jsHeap.status).toBe('not measured');
    expect(isMemorySkipped(memory)).toBe(true);
    expect(isMemorySkipped(unsupportedEngineMemory('firefox'))).toBe(false);
    expect(isMemorySkipped(notRecordedMemory())).toBe(false);
    expect(isMemorySkipped(undefined)).toBe(false);
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
      'JS heap (main thread only, lower bound)',
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

describe('memoryPassFailure', () => {
  it('memoryPassFailure_errorInstance_recordsMessageAsNotMeasured', () => {
    expect(memoryPassFailure(new Error('Timeout 120000ms exceeded'))).toEqual(
      notMeasured('memory pass failed: Timeout 120000ms exceeded'),
    );
  });

  it('memoryPassFailure_nonError_stringifiesTheValue', () => {
    expect(memoryPassFailure('boom')).toEqual(notMeasured('memory pass failed: boom'));
  });
});
