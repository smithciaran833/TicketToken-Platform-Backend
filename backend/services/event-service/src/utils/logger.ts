export const logger = {
  child: (_meta: any) => ({
    info: (msg: string, data?: any) => console.log(msg, data),
    error: (msg: string, error?: any) => console.error(msg, error),
    warn: (msg: string, data?: any) => console.warn(msg, data),
    debug: (msg: string, data?: any) => console.debug(msg, data)
  }),
  info: (msg: any, data?: any) => console.log(msg, data),
  error: (msg: any, error?: any) => console.error(msg, error),
  warn: (msg: any, data?: any) => console.warn(msg, data),
  debug: (msg: any, data?: any) => console.debug(msg, data)
};
