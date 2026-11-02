// A dedicated worker supplies pulses while the page's render loop is paused by tab visibility.
// Browser/OS freezing can still suspend the entire page; this does not defeat lifecycle suspension.
const clock = self as unknown as { postMessage(value: number): void };
setInterval(() => clock.postMessage(0), 1000 / 60);
export {};
