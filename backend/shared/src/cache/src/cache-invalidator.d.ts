import { EventEmitter } from 'events';
import { CacheService } from './cache-service';
export interface InvalidationRule {
    event: string;
    keys?: string[];
    patterns?: string[];
    tags?: string[];
    handler?: (payload: any) => string[] | Promise<string[]>;
}
export declare class CacheInvalidator extends EventEmitter {
    private cache;
    private rules;
    constructor(cache: CacheService);
    register(rule: InvalidationRule): void;
    registerMany(rules: InvalidationRule[]): void;
    process(event: string, payload?: any): Promise<void>;
    setupDefaultRules(): void;
    private findKeysByPattern;
    private resolveTags;
}
//# sourceMappingURL=cache-invalidator.d.ts.map