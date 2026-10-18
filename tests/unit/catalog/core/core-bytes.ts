import { readFileSync } from 'node:fs';

import manifestData from '../../../../catalog/core.v1.json';
import { COMPONENT_CATALOG, type CatalogComponent } from '../../../../src/catalog/components';
import {
  decodeCatalogCore,
  mergeCatalog,
  parseCoreManifest,
  type CoreManifest,
} from '../../../../src/catalog/core';

/** The committed catalog/core.v1.bin as an ArrayBuffer of its own (tests may edit a copy). */
export const coreBytes = (): ArrayBuffer => {
  const file = readFileSync(new URL('../../../../catalog/core.v1.bin', import.meta.url));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
};

export const CORE_MANIFEST: CoreManifest = parseCoreManifest(manifestData);
export const CORE_MANIFEST_DATA: unknown = manifestData;

/** The full catalog the application shows once the core has loaded. */
export const fullCatalog = (): CatalogComponent[] =>
  mergeCatalog(COMPONENT_CATALOG, decodeCatalogCore(coreBytes(), CORE_MANIFEST));
