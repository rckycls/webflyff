// A text file handed to the browser as a download (2026-11-15, B6): the result window's Save, where Neuz writes
// `GuildLog_YYYYMMDD.txt` next to the game (WndField.cpp:17703-17728).

export function saveTextFile(doc: Document, filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
