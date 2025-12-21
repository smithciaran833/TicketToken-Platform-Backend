"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const analytics_routes_1 = __importDefault(require("./analytics.routes"));
const router = (0, express_1.Router)();
exports.router = router;
router.use('/', analytics_routes_1.default);
router.get('/cache/stats', async (req, res) => {
    const { serviceCache } = require('../services/cache-integration');
    const stats = serviceCache.getStats();
    res.json(stats);
});
router.delete('/cache/flush', async (req, res) => {
    const { serviceCache } = require('../services/cache-integration');
    await serviceCache.flush();
    res.json({ success: true, message: 'Cache flushed' });
});
//# sourceMappingURL=index.js.map