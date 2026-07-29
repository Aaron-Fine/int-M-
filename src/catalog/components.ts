import catalogData from "../../catalog/components.v1.json";
import type { Complex } from "../domain/types";

export interface RationalAngle {
  readonly numerator: number;
  readonly denominator: number;
}

export interface AngledAddressStep {
  readonly fromPeriod: number;
  readonly toPeriod: number;
  readonly rotation: RationalAngle;
}

export interface CatalogComponent {
  readonly id: string;
  readonly label: string;
  readonly center: Complex;
  readonly centerPrecisionDigits: number;
  readonly period: number;
  readonly internalAddress?: readonly number[];
  readonly angledInternalAddress?: readonly AngledAddressStep[];
  /** Exactly two angles when present; validated with the catalog fixture. */
  readonly characteristicRays?: readonly RationalAngle[];
}

export const CATALOG_SCHEMA_VERSION = catalogData.schemaVersion;
export const CATALOG_LICENSE = catalogData.license;

/**
 * Independently generated centers for every hyperbolic component of exact
 * period at most four. Combinatorial fields are present only where the current
 * catalog can defend them; absent values are not inferred from screen position.
 */
export const COMPONENT_CATALOG: readonly CatalogComponent[] =
  catalogData.components;

export function findCatalogComponent(id: string): CatalogComponent | undefined {
  return COMPONENT_CATALOG.find((component) => component.id === id);
}
