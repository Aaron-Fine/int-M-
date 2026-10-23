/** The catalog core worker's one request and one reply (ADR 0014). */
export interface CatalogCoreRequest {
  /** URL of catalog/core.v1.bin. */
  readonly url: string;
  /** The parsed catalog/core.v1.json; the worker validates it. */
  readonly manifest: unknown;
}

export type CatalogCoreReply =
  /** The verified file, transferred: it matched the manifest's SHA-256 and decoded cleanly. */
  | { readonly type: 'catalog-core'; readonly bytes: ArrayBuffer }
  | { readonly type: 'catalog-core-error'; readonly message: string };
