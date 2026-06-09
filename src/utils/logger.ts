export type LogLevel = 'info' | 'warn' | 'error' | 'success';

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: LogLevel, message: string): void {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${prefix} ${message}\n`);
}

export const logger = {
  info(message: string): void {
    write('info', message);
  },
  warn(message: string): void {
    write('warn', message);
  },
  error(message: string): void {
    write('error', message);
  },
  success(message: string): void {
    write('success', message);
  },
};
