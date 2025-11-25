"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const knex_1 = __importDefault(require("knex"));
exports.db = (0, knex_1.default)({
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken',
    pool: {
        min: 2,
        max: 10
    }
});
//# sourceMappingURL=database.js.map