/**
 * The schema v1 catalog (catalog/components.v1.json, removed by ADR 0011), frozen:
 * each v1 id, the canonical id it is an alias of, its label and its v1 centre.
 * v1 share links name these ids in `sel=`, so they must resolve forever
 * (ADR 0009). The v1 centres were binary64 Durand-Kerner roots, within
 * 2.1e-15 of the refined centres v2 stores.
 */
export const V1_CATALOG = [
  { v1Id: 'mi-p1-main', label: 'Main cardioid', id: 'mi-p1-0-1', center: { re: 0, im: 0 } },
  {
    v1Id: 'mi-p2-basilica',
    label: '1/2-bulb (basilica)',
    id: 'mi-p2-1-2',
    center: { re: -1, im: 0 },
  },
  {
    v1Id: 'mi-p3-airplane',
    label: 'Airplane component',
    id: 'mi-p3-3-4',
    center: { re: -1.7548776662466907, im: 0 },
  },
  {
    v1Id: 'mi-p3-corabbit',
    label: '2/3-bulb (corabbit)',
    id: 'mi-p3-5-6',
    center: { re: -0.1225611668766535, im: -0.7448617666197435 },
  },
  {
    v1Id: 'mi-p3-rabbit',
    label: '1/3-bulb (Douady rabbit)',
    id: 'mi-p3-1-2',
    center: { re: -0.1225611668766535, im: 0.7448617666197435 },
  },
  {
    v1Id: 'mi-p4-01',
    label: 'Period-4 component 1',
    id: 'mi-p4-7-8',
    center: { re: -1.9407998065294834, im: 0 },
  },
  {
    v1Id: 'mi-p4-02',
    label: 'Period-4 component 2',
    id: 'mi-p4-6-9',
    center: { re: -1.3107026413368348, im: 0 },
  },
  {
    v1Id: 'mi-p4-03',
    label: 'Period-4 component 3',
    id: 'mi-p4-11-12',
    center: { re: -0.1565201668337543, im: -1.0322471089228327 },
  },
  {
    v1Id: 'mi-p4-04',
    label: 'Period-4 component 4',
    id: 'mi-p4-3-4',
    center: { re: -0.1565201668337543, im: 1.0322471089228327 },
  },
  {
    v1Id: 'mi-p4-05',
    label: 'Period-4 component 5',
    id: 'mi-p4-13-14',
    center: { re: 0.2822713907669141, im: -0.5300606175785254 },
  },
  {
    v1Id: 'mi-p4-06',
    label: 'Period-4 component 6',
    id: 'mi-p4-1-2',
    center: { re: 0.2822713907669141, im: 0.5300606175785254 },
  },
] as const;
