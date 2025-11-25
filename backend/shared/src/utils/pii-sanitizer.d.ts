export declare class PIISanitizer {
    private static readonly PII_PATTERNS;
    static sanitize(data: any): any;
    static sanitizeRequest(req: any): any;
    private static sanitizeString;
    private static isSensitiveKey;
    private static maskIP;
}
//# sourceMappingURL=pii-sanitizer.d.ts.map