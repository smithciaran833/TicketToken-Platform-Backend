// Simple cache integration - can be enhanced later
export const cache = {
  get: async (key: string) => null,
  set: async (key: string, value: any, ttl?: number) => true,
  delete: async (key: string) => true,
  flush: async () => true,
  getStats: () => ({ hits: 0, misses: 0, sets: 0, deletes: 0 })
};
