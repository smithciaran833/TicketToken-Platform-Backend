export interface Logger {
    info(message: string | object, ...args: any[]): void;
    error(message: string | object, ...args: any[]): void;
    debug(message: string | object, ...args: any[]): void;
    warn(message: string | object, ...args: any[]): void;
}
export declare const createLogger: (name: string) => Logger;
//# sourceMappingURL=logger.d.ts.map