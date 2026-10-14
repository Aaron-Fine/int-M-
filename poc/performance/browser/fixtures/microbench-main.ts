import type {
  BandOrderParams,
  ConjugateMirrorParams,
  CoarseCostParams,
  EnvironmentSample,
  MicrobenchApi,
  PoolSizingParams,
  YieldAbParams,
  ZeroCopyParams,
} from './microbench-api';
import { runBandOrder } from './band-order';
import { runCoarseCost } from './coarse-cost';
import { runConjugateMirror } from './conjugate-mirror';
import { runPoolSizing } from './pool-sizing';
import { runYieldAb } from './yield-ab';
import { runZeroCopy } from './transfer-ab';

// Runners may be synchronous (conjugate-mirror) or async (worker-driven
// measurements); both satisfy `=> unknown`, and the API contract stays
// promise-based for the specs.
type Runner = (params: unknown) => unknown;

const startEchoWorker = (): Worker =>
  new Worker(new URL('./echo.worker.ts', import.meta.url), {
    type: 'module',
    name: 'mi-poc-echo',
  });

/** One cold echo-worker spawn and a 16 KiB roundtrip; worker sanity probe. */
const echoWorkerRoundtrip = (bytes: number): Promise<number> =>
  new Promise<number>((resolve, reject) => {
    const worker = startEchoWorker();
    const started = performance.now();
    worker.addEventListener('error', () => {
      worker.terminate();
      reject(new Error('echo worker failed to start or errored'));
    });
    worker.addEventListener('message', () => {
      const elapsed = performance.now() - started;
      worker.terminate();
      resolve(elapsed);
    });
    worker.postMessage({ type: 'echo', bytes });
  });

const sampleEnvironment = async (): Promise<EnvironmentSample> => {
  const echoWorkerRoundtripMs = await echoWorkerRoundtrip(16_384);
  return {
    hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : null,
    devicePixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
    echoWorkerRoundtripMs,
  };
};

const requireKeys = (params: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (typeof params !== 'object' || params === null) {
    throw new Error(`runner params must be an object containing: ${keys.join(', ')}`);
  }
  const record = params as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in record)) {
      throw new Error(`runner params missing key: ${key}`);
    }
  }
  return record;
};

const runners: Record<string, Runner> = {
  environment: () => sampleEnvironment(),
  'pool-sizing': (params) => {
    requireKeys(params, ['caseId', 'profileId', 'edge', 'sizes', 'measuredReps']);
    return runPoolSizing(params as PoolSizingParams);
  },
  'yield-ab': (params) => {
    requireKeys(params, ['hops', 'cancelReps']);
    return runYieldAb(params as YieldAbParams);
  },
  'zero-copy': (params) => {
    requireKeys(params, ['repsPerMode']);
    return runZeroCopy(params as ZeroCopyParams);
  },
  'band-order': (params) => {
    requireKeys(params, ['rows', 'bandCount', 'workerCount', 'reps']);
    return runBandOrder(params as BandOrderParams);
  },
  'conjugate-mirror': (params) => {
    requireKeys(params, ['viewId', 'centerRe', 'spanY', 'edge', 'profileId', 'warmupReps', 'reps']);
    return runConjugateMirror(params as ConjugateMirrorParams);
  },
  'coarse-cost': (params) => {
    requireKeys(params, ['caseId', 'profileId', 'edge', 'warmupRows']);
    return runCoarseCost(params as CoarseCostParams);
  },
};

const api: MicrobenchApi = {
  runnerNames: Object.keys(runners),
  run: (name: string, params?: unknown): Promise<unknown> => {
    const runner = runners[name];
    if (runner === undefined) {
      throw new Error(`unknown microbench runner: ${name}`);
    }
    return Promise.resolve(runner(params));
  },
};

window.__miPocBench = api;

const status = document.getElementById('status');
if (status !== null) {
  status.textContent = `Microbench runners ready: ${api.runnerNames.join(', ')}`;
}
