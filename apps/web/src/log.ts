/** Where the web service writes its log (the gateway's shape, apps/gateway/src/log.ts, with `warn`). One call is one line. */
export interface Logger {
  info(line: string): void;
  warn(line: string): void;
}

/** Writes each line to the console, behind the time it was written. */
export const consoleLogger: Logger = {
  info(line) {
    console.log(`${new Date().toISOString()} ${line}`);
  },
  warn(line) {
    console.warn(`${new Date().toISOString()} ${line}`);
  },
};
