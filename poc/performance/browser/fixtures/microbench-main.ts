import type { EnvironmentSample, MicrobenchApi } from './microbench-api';

type Runner = (params: unknown) => Promise<unknown>;

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

const runners: Record<string, Runner> = {
  environment: () => sampleEnvironment(),
};

const api: MicrobenchApi = {
  runnerNames: Object.keys(runners),
  run: async (name: string, params?: unknown): Promise<unknown> => {
    const runner = runners[name];
    if (runner === undefined) {
      throw new Error(`unknown microbench runner: ${name}`);
    }
    return runner(params);
  },
};

window.__miPocBench = api;

const status = document.getElementById('status');
if (status !== null) {
  status.textContent = `Microbench runners ready: ${api.runnerNames.join(', ')}`;
}
