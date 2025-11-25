"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishSearchSync = publishSearchSync;
exports.closeSearchSync = closeSearchSync;
const amqp = __importStar(require("amqplib"));
let connection = null;
let channel = null;
let isConnecting = false;
const EXCHANGE_NAME = 'search.sync';
const RABBITMQ_URL = process.env.RABBITMQ_URL || process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672';
async function connect() {
    if (connection && channel)
        return;
    if (isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
        return connect();
    }
    isConnecting = true;
    try {
        console.log('🔌 Connecting to RabbitMQ for search sync...');
        connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
        console.log('✅ Search sync publisher connected');
        connection.on('error', (err) => {
            console.error('❌ RabbitMQ connection error:', err);
            connection = null;
            channel = null;
        });
        connection.on('close', () => {
            console.warn('⚠️  RabbitMQ connection closed');
            connection = null;
            channel = null;
        });
    }
    catch (error) {
        console.error('❌ Failed to connect to RabbitMQ:', error);
        connection = null;
        channel = null;
        throw error;
    }
    finally {
        isConnecting = false;
    }
}
async function publishSearchSync(routingKey, payload) {
    try {
        if (!connection || !channel) {
            await connect();
        }
        if (!channel) {
            throw new Error('Failed to establish RabbitMQ channel');
        }
        const message = JSON.stringify({
            ...payload,
            timestamp: new Date().toISOString(),
            routingKey,
        });
        const published = channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(message), {
            persistent: true,
            contentType: 'application/json',
        });
        if (!published) {
            await new Promise((resolve) => channel.once('drain', resolve));
            channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(message), {
                persistent: true,
                contentType: 'application/json',
            });
        }
        console.log(`📤 Search sync: ${routingKey}`);
    }
    catch (error) {
        console.error(`❌ Failed to publish search sync (${routingKey}):`, error);
        connection = null;
        channel = null;
    }
}
async function closeSearchSync() {
    try {
        if (channel)
            await channel.close();
        if (connection)
            await connection.close();
        console.log('✅ Search sync publisher closed');
    }
    catch (error) {
        console.error('Error closing search sync:', error);
    }
    finally {
        channel = null;
        connection = null;
    }
}
//# sourceMappingURL=searchSyncPublisher.js.map