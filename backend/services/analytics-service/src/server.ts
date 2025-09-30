import { Application } from 'express';
import { createApp } from './app';

export function createServer(): Application {
  const app = createApp();
  return app;
}
