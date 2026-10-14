import type {
  BandOrderParams,
  BandOrderResult,
  BandOrderSample,
  BandOrderStrategy,
} from './microbench-api';

/**
 * Plan §12 renderer-path detail (center-out band scheduling): a
 * perceived-latency metric gated on time-to-first-50%-rows. This is an
 * honest SIMULATION, labeled as such: band jobs are synthetic spins in real
 * web workers with a deterministic per-band cost profile; the classifier is
 * not involved. It measures how dispatch order (top-to-bottom vs
 * center-out) changes time-to-first-band and time-to-50%-of-rows, under
 * uniform costs (control: order should not matter) and center-cheap skewed
 * costs.
 */

const dispatchOrder = (strategy: BandOrderStrategy, bandCount: number): number[] => {
  const indices = Array.from({ length: bandCount }, (_unused, index) => index);
  if (strategy === 'top-to-bottom') return indices;
  const center = (bandCount - 1) / 2;
  return indices.sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
};

const costProfile = (profile: 'uniform' | 'edges-heavy', bandCount: number): number[] => {
  const costs: number[] = [];
  const center = (bandCount - 1) / 2;
  for (let band = 0; band < bandCount; band += 1) {
    if (profile === 'uniform') {
      costs.push(24);
    } else {
      const edgeDistance = Math.abs(band - center) / center;
      costs.push(8 + 40 * edgeDistance);
    }
  }
  return costs;
};

const startSpinWorker = (index: number): Worker =>
  new Worker(new URL('./echo.worker.ts', import.meta.url), {
    type: 'module',
    name: `mi-poc-spin-${index}`,
  });

interface SpinSlot {
  readonly worker: Worker;
}

interface PipelineOutcome {
  readonly ttfbMs: number;
  readonly t50RowsMs: number;
  readonly totalMs: number;
}

/**
 * A pool of real workers draining a job queue in dispatch order: the
 * progressive-pipeline shape workstream E would use for microbands, with
 * synthetic per-band costs.
 */
class SpinWorkerSet {
  readonly #slots: SpinSlot[] = [];

  public constructor(size: number) {
    for (let index = 0; index < size; index += 1) {
      this.#slots.push({ worker: startSpinWorker(index) });
    }
  }

  public async ready(): Promise<void> {
    await Promise.all(
      this.#slots.map(
        (slot) =>
          new Promise<void>((resolve, reject) => {
            slot.worker.addEventListener('error', () => reject(new Error('spin worker failed')), {
              once: true,
            });
            slot.worker.addEventListener('message', () => resolve(), { once: true });
            slot.worker.postMessage({ type: 'echo', bytes: 1 });
          }),
      ),
    );
  }

  public runQueue(jobsMs: readonly number[], rowsPerBand: number): Promise<PipelineOutcome> {
    const totalJobs = jobsMs.length;
    const order = Array.from({ length: totalJobs }, (_unused, index) => index);
    const started = performance.now();
    let nextJob = 0;
    let completedBands = 0;
    let completedRows = 0;
    let ttfbMs = Number.NaN;
    let t50RowsMs = Number.NaN;
    const halfRows = (rowsPerBand * totalJobs) / 2;

    return new Promise<PipelineOutcome>((resolve) => {
      const dispatch = (slot: SpinSlot): void => {
        const jobIndex = order[nextJob];
        if (jobIndex === undefined) throw new Error('job queue exhausted early');
        nextJob += 1;
        const onAck = (event: MessageEvent<unknown>): void => {
          const message = event.data as { type?: string };
          if (message.type !== 'spin-ack') return;
          slot.worker.removeEventListener('message', onAck);
          completedBands += 1;
          completedRows += rowsPerBand;
          const now = performance.now() - started;
          if (Number.isNaN(ttfbMs)) ttfbMs = now;
          if (Number.isNaN(t50RowsMs) && completedRows >= halfRows) t50RowsMs = now;
          if (completedBands === totalJobs) {
            resolve({ ttfbMs, t50RowsMs, totalMs: now });
            return;
          }
          if (nextJob < totalJobs) dispatch(slot);
        };
        slot.worker.addEventListener('message', onAck);
        slot.worker.postMessage({ type: 'spin', ms: jobsMs[jobIndex] ?? 0 });
      };

      for (const slot of this.#slots) {
        if (nextJob < totalJobs) dispatch(slot);
      }
    });
  }

  public dispose(): void {
    for (const slot of this.#slots) {
      slot.worker.terminate();
    }
    this.#slots.length = 0;
  }
}

export const runBandOrder = async (params: BandOrderParams): Promise<BandOrderResult> => {
  const rowsPerBand = Math.floor(params.rows / params.bandCount);
  const strategies: readonly BandOrderStrategy[] = ['top-to-bottom', 'center-out'];
  const profiles = ['uniform', 'edges-heavy'] as const;
  const pool = new SpinWorkerSet(params.workerCount);
  await pool.ready();

  const samples: BandOrderSample[] = [];
  try {
    for (const profile of profiles) {
      const costs = costProfile(profile, params.bandCount);
      for (let rep = 0; rep < params.reps; rep += 1) {
        // Alternate strategy order per rep to spread thermal drift.
        const order = rep % 2 === 0 ? strategies : [...strategies].reverse();
        for (const strategy of order) {
          const jobsMs = dispatchOrder(strategy, params.bandCount).map((band) => costs[band] ?? 0);
          const outcome = await pool.runQueue(jobsMs, rowsPerBand);
          samples.push({
            profile,
            strategy,
            rep,
            ttfbMs: outcome.ttfbMs,
            t50RowsMs: outcome.t50RowsMs,
            totalMs: outcome.totalMs,
          });
        }
      }
    }
  } finally {
    pool.dispose();
  }

  return {
    rows: params.rows,
    bandCount: params.bandCount,
    rowsPerBand,
    workerCount: params.workerCount,
    reps: params.reps,
    samples,
  };
};
