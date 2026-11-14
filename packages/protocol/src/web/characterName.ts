/**
 * What the create screen checks about a name, for English (`IsValidPlayerName`), in its order. The name is judged
 * trimmed. Returns the message to show, or `undefined` when the name is fine. Only ASCII letters and digits are
 * allowed, so a name always fits the ASCII-only packets. Shared by the client's create screen and the admin panel's
 * rename.
 */
export function validateCharacterName(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter name.';
  if (trimmed.length < 4 || trimmed.length > 16) return 'Character Name must be 4 to 16 characters long.';
  if (/^[0-9]/.test(trimmed)) return 'The name cannot start with a number.';
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) return 'You cannot use special characters or spaces in a name.';
  return undefined;
}
