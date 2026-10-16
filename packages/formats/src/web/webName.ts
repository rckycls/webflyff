/**
 * The file-name-safe form of a client asset name: lower case, and every character outside `a-z 0-9 . _ -` becomes
 * a dash (`'Obj_ AzriaThicket01'` is `'obj_-azriathicket01'`). The converter names its output files and the
 * manifest's logical keys with it; the client's own names mix case and contain spaces.
 */
export function webName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}
