// A model's extra texture sets (`WebMover.textureEx`, `ModelElem::m_nTextureEx`): CObject3D::LoadTextureEx
// (Source/_Common/Object3D.cpp:2477-2508) loads, for set N, each material's texture with `-et` and N in two digits after
// its title: GetFileTitle (the name up to its first `.`, after the last `\`, xUtil.cpp:194-207), `-et`, `%02d`, `.`, then
// GetFileExt (the text after the last `.`, :233-246). `Mvr_PetWhiteTiger01.dds` set 1 is `Mvr_PetWhiteTiger01-et01.dds`.
// The textures stage converts every picture of Model/TextureMid, so these files are converted with the others.

/**
 * The file name of set `set` of the texture `fileName`, as LoadTextureEx builds it. A name with no `.` (no material has
 * one) ends at the `.`.
 */
export function textureExName(fileName: string, set: number): string {
  const name = fileName.slice(fileName.lastIndexOf('\\') + 1);
  const dot = name.indexOf('.');
  const title = dot < 0 ? name : name.slice(0, dot);
  const lastDot = fileName.lastIndexOf('.');
  const ext = lastDot < 0 ? '' : fileName.slice(lastDot + 1);
  return `${title}-et${String(set).padStart(2, '0')}.${ext}`;
}

/**
 * The logical key of set `set` of a model texture, from the texture's own key (`textures/<web name of the file>.ktx2`, the
 * `extras.texture` of a model glb's material): the key of `textureExName`. `webName` changes each character on its own, so
 * the rule works on the key's web name as on the file name.
 */
export function textureExKey(textureKey: string, set: number): string {
  const match = /^(textures\/)([^/]+)(\.ktx2)$/.exec(textureKey);
  if (match === null) throw new RangeError(`"${textureKey}" is not a model texture key (textures/<name>.ktx2)`);
  return `${match[1]}${textureExName(match[2]!, set)}${match[3]}`;
}
