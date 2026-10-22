/** Where the gateway writes its connection log. One call is one line, without a trailing newline. */
export interface Logger {
  info(line: string): void;
}

/** Writes each line to the console, behind the time it was written. */
export const consoleLogger: Logger = {
  info(line) {
    console.log(`${new Date().toISOString()} ${line}`);
  },
};
