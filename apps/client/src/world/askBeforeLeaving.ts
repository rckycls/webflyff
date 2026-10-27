/**
 * While the world is open, the browser asks the player to confirm before the page is closed, reloaded or navigated away
 * ("Leave site?" in Chrome): a `beforeunload` listener that cancels the event, with `returnValue` set too, which older
 * Chrome, Edge and Safari need (both together is the documented form). The text is the browser's own, and the page cannot
 * stop the close, only ask. Returns the function that stops asking (the world screen's ending: the login page that follows
 * closes without a question). Log out needs none of this: it returns to the login page without unloading.
 *
 * Neuz does not ask: `WM_CLOSE` in the game only sets `m_bQuit` and lets the close go on (`Neuz.cpp:1446-1462`, then
 * `:1139-1142`). This is the web client's own rule, for a tab closed by a slip.
 */
export function askBeforeLeaving(view: EventTarget): () => void {
  const onBeforeUnload = (event: Event): void => {
    event.preventDefault();
    (event as BeforeUnloadEvent).returnValue = '';
  };
  view.addEventListener('beforeunload', onBeforeUnload);
  return () => view.removeEventListener('beforeunload', onBeforeUnload);
}
