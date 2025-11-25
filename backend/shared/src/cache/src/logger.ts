export interface Logger {
  info(message: string | object, ...args: any[]): void;
  error(message: string | object, ...args: any[]): void;
  debug(message: string | object, ...args: any[]): void;
  warn(message: string | object, ...args: any[]): void;
}

export const createLogger = (name: string): Logger => {
  const formatMessage = (level: string, message: any, args: any[]) => {
    const timestamp = new Date().toISOString();
    if (typeof message === 'object') {
      return `[${timestamp}] [${level}] [${name}] ${JSON.stringify(message)} ${args.join(' ')}`;
    }
    return `[${timestamp}] [${level}] [${name}] ${message} ${args.join(' ')}`;
  };

  return {
    info: (message, ...args) => console.log(formatMessage('INFO', message, args)),
    error: (message, ...args) => console.error(formatMessage('ERROR', message, args)),
    debug: (message, ...args) => {
      if (process.env.DEBUG) console.log(formatMessage('DEBUG', message, args));
    },
    warn: (message, ...args) => console.warn(formatMessage('WARN', message, args)),
  };
};
