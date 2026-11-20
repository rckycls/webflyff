// A home page screenshot's caption (2026-11-21): the picture's file name without its number and extension, so
// `content/screenshots/02-boss-fight.webp` reads "Boss fight". A name with no words falls back to "Screenshot N".

/** The caption for the screenshot at `url`, the `index`-th on the page. */
export function shotLabel(url: string, index: number): string {
  let file = url.split('/').pop() ?? '';
  try { file = decodeURIComponent(file); } catch { /* keep it as it is */ }
  const words = file.replace(/\.[a-z0-9]+$/i, '').replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' ').trim();
  return words === '' ? `Screenshot ${index + 1}` : words.charAt(0).toUpperCase() + words.slice(1);
}
