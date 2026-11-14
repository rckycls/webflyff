// The game's item list for the Send tab (admin panel spec §5.5), from FlyffWeb's converted data.

export interface CatalogItem {
  id: number;
  name: string;
  /** The most of it one slot holds. */
  packMax: number;
  /** A weapon or armour (kind1 1 or 2): it can carry +0 to +10. */
  upgradable: boolean;
}
