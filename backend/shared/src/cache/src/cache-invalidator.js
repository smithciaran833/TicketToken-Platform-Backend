"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheInvalidator = void 0;
const events_1 = require("events");
class CacheInvalidator extends events_1.EventEmitter {
    cache;
    rules = new Map();
    constructor(cache) {
        super();
        this.cache = cache;
    }
    register(rule) {
        const rules = this.rules.get(rule.event) || [];
        rules.push(rule);
        this.rules.set(rule.event, rules);
    }
    registerMany(rules) {
        rules.forEach(rule => this.register(rule));
    }
    async process(event, payload) {
        const rules = this.rules.get(event);
        if (!rules)
            return;
        const promises = rules.map(async (rule) => {
            try {
                if (rule.keys) {
                    await this.cache.delete(rule.keys);
                }
                if (rule.patterns) {
                    for (const pattern of rule.patterns) {
                        const keys = await this.findKeysByPattern(pattern, payload);
                        if (keys.length > 0) {
                            await this.cache.delete(keys);
                        }
                    }
                }
                if (rule.tags) {
                    const tags = this.resolveTags(rule.tags, payload);
                    await this.cache.deleteByTags(tags);
                }
                if (rule.handler) {
                    const keys = await rule.handler(payload);
                    if (keys && keys.length > 0) {
                        await this.cache.delete(keys);
                    }
                }
                this.emit('invalidated', { event, rule, payload });
            }
            catch (error) {
                this.emit('error', { event, rule, payload, error });
            }
        });
        await Promise.all(promises);
    }
    setupDefaultRules() {
        this.registerMany([
            {
                event: 'user.updated',
                handler: async (payload) => [
                    `auth:user:${payload.userId}`,
                    `auth:session:*:${payload.userId}`
                ]
            },
            {
                event: 'user.logout',
                handler: async (payload) => [
                    `auth:session:${payload.sessionId}`
                ]
            },
            {
                event: 'event.updated',
                handler: async (payload) => [
                    `event:details:${payload.eventId}`,
                    `event:tickets:${payload.eventId}`,
                    `venue:events:${payload.venueId}`
                ]
            },
            {
                event: 'event.created',
                handler: async (payload) => [
                    `venue:events:${payload.venueId}`,
                    `search:events:*`
                ]
            },
            {
                event: 'ticket.purchased',
                handler: async (payload) => [
                    `ticket:availability:${payload.eventId}`,
                    `event:details:${payload.eventId}`,
                    `user:tickets:${payload.userId}`
                ]
            },
            {
                event: 'ticket.transferred',
                handler: async (payload) => [
                    `user:tickets:${payload.fromUserId}`,
                    `user:tickets:${payload.toUserId}`,
                    `ticket:ownership:${payload.ticketId}`
                ]
            },
            {
                event: 'venue.updated',
                handler: async (payload) => [
                    `venue:profile:${payload.venueId}`,
                    `venue:events:${payload.venueId}`,
                    `venue:staff:${payload.venueId}`
                ]
            },
            {
                event: 'order.created',
                handler: async (payload) => [
                    `user:orders:${payload.userId}`,
                    `venue:orders:${payload.venueId}`,
                    `ticket:availability:${payload.eventId}`
                ]
            },
            {
                event: 'order.cancelled',
                handler: async (payload) => [
                    `user:orders:${payload.userId}`,
                    `venue:orders:${payload.venueId}`,
                    `ticket:availability:${payload.eventId}`
                ]
            },
            {
                event: 'payment.completed',
                handler: async (payload) => [
                    `order:status:${payload.orderId}`,
                    `user:orders:${payload.userId}`
                ]
            },
            {
                event: 'payment.failed',
                handler: async (payload) => [
                    `order:status:${payload.orderId}`,
                    `ticket:availability:${payload.eventId}`
                ]
            }
        ]);
    }
    async findKeysByPattern(pattern, payload) {
        let resolvedPattern = pattern;
        if (payload) {
            Object.keys(payload).forEach(key => {
                resolvedPattern = resolvedPattern.replace(`{${key}}`, payload[key]);
            });
        }
        return [];
    }
    resolveTags(tags, payload) {
        if (!payload)
            return tags;
        return tags.map(tag => {
            let resolvedTag = tag;
            Object.keys(payload).forEach(key => {
                resolvedTag = resolvedTag.replace(`{${key}}`, payload[key]);
            });
            return resolvedTag;
        });
    }
}
exports.CacheInvalidator = CacheInvalidator;
//# sourceMappingURL=cache-invalidator.js.map