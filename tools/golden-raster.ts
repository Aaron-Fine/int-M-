/**
 * The golden raster: the size at which the kernel and colorized goldens
 * (tools/generate_kernel_golden.ts, tools/generate_colorized_golden.ts) and the
 * per-pixel dumps (tools/kernel_pixel_dump.ts) classify the frozen corpus. A
 * module without side effects, so every tool can import it: bundled together,
 * a tool's entry guard would run its main.
 */
export const GOLDEN_RASTER = { width: 160, height: 100 } as const;
