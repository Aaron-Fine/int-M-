export class RenderCancelledError extends Error {
  public constructor() {
    super('render cancelled');
    this.name = 'RenderCancelledError';
  }
}
