"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAxiosInstance = createAxiosInstance;
const axios_1 = __importDefault(require("axios"));
function createAxiosInstance(baseURL, timeout = 10000) {
    const instance = axios_1.default.create({
        baseURL,
        timeout,
        headers: {
            'Content-Type': 'application/json'
        }
    });
    instance.interceptors.request.use((config) => {
        return config;
    }, (error) => Promise.reject(error));
    instance.interceptors.response.use((response) => response, async (error) => {
        if (error.response?.status === 401) {
        }
        return Promise.reject(error);
    });
    return instance;
}
exports.default = { createAxiosInstance };
//# sourceMappingURL=http.js.map