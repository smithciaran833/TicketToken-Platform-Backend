import express from 'express';
import { createApp } from './app';

export function createServer() {
  return createApp();
}
