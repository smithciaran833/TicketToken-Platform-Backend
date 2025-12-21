"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = healthRoutes;
const health_controller_1 = require("../controllers/health.controller");
async function healthRoutes(app) {
    app.get('/health', async (request, reply) => {
        return health_controller_1.healthController.health(request, reply);
    });
    app.get('/health/ready', async (request, reply) => {
        return health_controller_1.healthController.readiness(request, reply);
    });
    app.get('/health/live', async (request, reply) => {
        return health_controller_1.healthController.liveness(request, reply);
    });
    app.get('/health/dependencies', async (request, reply) => {
        return health_controller_1.healthController.dependencies(request, reply);
    });
}
//# sourceMappingURL=health.routes.js.map