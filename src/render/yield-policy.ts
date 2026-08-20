export function yieldMaskForQuality(maxIterations: number): number {
  return maxIterations > 512 ? 1 : 7;
}

export function shouldYieldToEventLoop(y: number, stride: number, mask: number): boolean {
  return (Math.floor(y / stride) & mask) === mask;
}
