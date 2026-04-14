type LogLevel = "info" | "warn" | "error";

const serializeData = (data: unknown): unknown => {
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack,
    };
  }

  return data;
};

const writeLog = (level: LogLevel, msg: string, data?: unknown): void => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(data === undefined ? {} : { data: serializeData(data) }),
  };

  process.stdout.write(`${JSON.stringify(entry)}\n`);
};

export const log = {
  info: (msg: string, data?: unknown) => {
    writeLog("info", msg, data);
  },
  warn: (msg: string, data?: unknown) => {
    writeLog("warn", msg, data);
  },
  error: (msg: string, data?: unknown) => {
    writeLog("error", msg, data);
  },
};
