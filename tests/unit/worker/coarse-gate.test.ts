import { describe, expect, it } from 'vitest';

import type { Renderer, SemanticFrame } from '../../../src/render';
import { createCoarseGate, isCoarseGateMessage } from '../../../src/worker/coarse-gate';

const frame = (stage: SemanticFrame['stage']): SemanticFrame => ({
  stage,
  size: { width: 1, height: 1 },
  sampleStride: 1,
  bands: [],
  progress: stage === 'coarse' ? 0.2 : 1,
});

/** Delivers a coarse then a stable frame, stopping early once aborted, like CpuRenderer. */
const twoStageRenderer = (): Renderer => ({
  async render(_request, signal, onFrame) {
    await onFrame(frame('coarse'));
    if (signal.aborted) return;
    await onFrame(frame('stable'));
  },
  inspect: () => {
    throw new Error('not used');
  },
  colorize: () => {
    throw new Error('not used');
  },
});

const request = {} as Parameters<Renderer['render']>[0];

/** Starts a render and records the stages it delivers. */
const start = (renderer: Renderer, signal = new AbortController().signal) => {
  const stages: string[] = [];
  const done = renderer.render(request, signal, (delivered) => {
    stages.push(delivered.stage);
  });
  return { stages, done };
};

/** Lets every pending promise reaction run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('coarse gate (e2e test seam)', () => {
  it('passes renders straight through when not held', async () => {
    const gate = createCoarseGate(twoStageRenderer());
    const { stages, done } = start(gate.renderer);
    await done;
    expect(stages).toEqual(['coarse', 'stable']);
  });

  it('holds a render after its coarse frame until released', async () => {
    const gate = createCoarseGate(twoStageRenderer());
    gate.hold();
    const { stages, done } = start(gate.renderer);
    await settle();
    expect(stages).toEqual(['coarse']);
    gate.release();
    await done;
    expect(stages).toEqual(['coarse', 'stable']);
  });

  it('lets a cancelled render go without a release', async () => {
    const gate = createCoarseGate(twoStageRenderer());
    gate.hold();
    const controller = new AbortController();
    const { stages, done } = start(gate.renderer, controller.signal);
    await settle();
    controller.abort();
    await done;
    expect(stages).toEqual(['coarse']);
  });

  it('does not hold renders started after a release', async () => {
    const gate = createCoarseGate(twoStageRenderer());
    gate.hold();
    gate.release();
    const { stages, done } = start(gate.renderer);
    await done;
    expect(stages).toEqual(['coarse', 'stable']);
  });

  it('recognizes only well-formed gate messages', () => {
    expect(isCoarseGateMessage({ type: 'e2e-coarse-gate', hold: true })).toBe(true);
    expect(isCoarseGateMessage({ type: 'e2e-coarse-gate' })).toBe(false);
    expect(isCoarseGateMessage({ type: 'render', hold: true })).toBe(false);
    expect(isCoarseGateMessage(null)).toBe(false);
  });
});
