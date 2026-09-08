export type LogExtra = Record<string, unknown>;

export interface Logger {
  info(msg: string, extra?: LogExtra): void;
  warn(msg: string, extra?: LogExtra): void;
  error(msg: string, extra?: LogExtra): void;
}

export function makeLogger(ctx: LogExtra = {}): Logger {
  const fmt = (level: string, msg: string, extra: LogExtra = {}) =>
    JSON.stringify({ ts: Date.now(), level, ...ctx, msg, ...extra });
  return {
    info: (msg, extra) => console.log(fmt('info', msg, extra)),
    warn: (msg, extra) => console.warn(fmt('warn', msg, extra)),
    error: (msg, extra) => console.error(fmt('error', msg, extra)),
  };
}
export const log = makeLogger();
