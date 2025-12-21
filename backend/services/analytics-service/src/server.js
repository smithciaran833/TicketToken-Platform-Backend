"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const app_1 = require("./app");
async function createServer() {
    const app = await (0, app_1.buildApp)();
    return app;
}
//# sourceMappingURL=server.js.map