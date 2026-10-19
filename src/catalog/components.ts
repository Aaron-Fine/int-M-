import catalogData from '../../catalog/components.v2.json';
import { catalogNames, parseCatalog, type CatalogComponent } from './schema';

export {
  ANNOTATION_MAX_LENGTH,
  catalogIdFor,
  catalogNames,
  CatalogSchemaError,
  MAX_CATALOG_PERIOD,
  parseCatalog,
  parseReferenceTable,
  rayModulus,
  REFERENCE_TABLE,
  type AngledAddressStep,
  type Catalog,
  type CatalogComponent,
  type CatalogProvenance,
  type CatalogReference,
  type CatalogResidual,
  type RationalAngle,
} from './schema';

/**
 * Independently generated centres of every hyperbolic component of exact
 * period at most four (catalog/components.v2.json, ADR 0011), validated on
 * load. Ids derive from the characteristic rays, so they survive
 * regeneration; v1 ids remain aliases.
 */
export const CATALOG = parseCatalog(catalogData);

export const COMPONENT_CATALOG: readonly CatalogComponent[] = CATALOG.components;

const BY_NAME = catalogNames(COMPONENT_CATALOG);

/** The component with this canonical id or alias (a v1 id), if any. */
export function findCatalogComponent(idOrAlias: string): CatalogComponent | undefined {
  return BY_NAME.get(idOrAlias);
}
