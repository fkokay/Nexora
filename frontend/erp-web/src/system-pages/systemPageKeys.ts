/**
 * Screen keys that have a standard system page definition (`src/Hosts/AIERP.Api/SystemPages/Standards/<key>.json`).
 * The runtime map only ever lists these keys, so any other built-in screen renders its legacy page without waiting for
 * the map. `systemPageKeys.test.ts` keeps this list in sync with the API's standards folder.
 */
export const systemPageScreenKeys: ReadonlySet<string> = new Set(["inventory-stock", "inventory-warehouses"]);

export const canBeSystemPage = (key: string) => systemPageScreenKeys.has(key);
