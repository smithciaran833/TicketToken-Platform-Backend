"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRabbitMQ = connectRabbitMQ;
exports.getChannel = getChannel;
exports.publishEvent = publishEvent;
exports.closeRabbitMQ = closeRabbitMQ;
const amqp = require('amqplib/callback_api');
const index_1 = require("./index");
const logger_1 = require("../utils/logger");
let connection;
let channel;
async function connectRabbitMQ() {
    return new Promise((resolve, reject) => {
        amqp.connect(index_1.config.rabbitmq.url, (error, conn) => {
            if (error) {
                logger_1.logger.error('Failed to connect to RabbitMQ:', error);
                reject(error);
                return;
            }
            connection = conn;
            connection.createChannel((error, ch) => {
                if (error) {
                    logger_1.logger.error('Failed to create channel:', error);
                    reject(error);
                    return;
                }
                channel = ch;
                channel.assertExchange(index_1.config.rabbitmq.exchange, 'topic', {
                    durable: true,
                });
                channel.assertQueue(index_1.config.rabbitmq.queue, {
                    durable: true,
                    exclusive: false,
                    autoDelete: false,
                }, (error, queue) => {
                    if (error) {
                        logger_1.logger.error('Failed to create queue:', error);
                        reject(error);
                        return;
                    }
                    channel.bindQueue(queue.queue, index_1.config.rabbitmq.exchange, '#');
                    logger_1.logger.info('RabbitMQ connected and configured');
                    connection.on('error', (err) => {
                        logger_1.logger.error('RabbitMQ connection error:', err);
                    });
                    connection.on('close', () => {
                        logger_1.logger.warn('RabbitMQ connection closed');
                    });
                    resolve();
                });
            });
        });
    });
}
function getChannel() {
    if (!channel) {
        throw new Error('RabbitMQ channel not initialized');
    }
    return channel;
}
async function publishEvent(routingKey, data) {
    try {
        const message = Buffer.from(JSON.stringify(data));
        channel.publish(index_1.config.rabbitmq.exchange, routingKey, message, { persistent: true });
    }
    catch (error) {
        logger_1.logger.error('Failed to publish event:', error);
        throw error;
    }
}
async function closeRabbitMQ() {
    return new Promise((resolve) => {
        if (channel) {
            channel.close(() => {
                if (connection) {
                    connection.close(() => {
                        logger_1.logger.info('RabbitMQ connection closed');
                        resolve();
                    });
                }
                else {
                    resolve();
                }
            });
        }
        else {
            resolve();
        }
    });
}
//# sourceMappingURL=rabbitmq.js.map