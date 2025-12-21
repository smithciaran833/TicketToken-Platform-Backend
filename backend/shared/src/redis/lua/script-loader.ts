/**
 * Redis Lua Script Loader
 * 
 * Loads and caches Lua scripts using SCRIPT LOAD and EVALSHA.
 * Falls back to EVAL if script isn't cached on server.
 */

import Redis from 'ioredis';
import { getRedisClient } from '../connection-manager';
import { LuaScript } from '../types';
import { LUA_SCRIPTS } from '../config';

/**
 * Script Loader Class
 */
export class ScriptLoader {
  private client: Redis | null = null;
  private loadedScripts: Map<string, string> = new Map();
  
  private async getClient(): Promise<Redis> {
    if (!this.client) {
      this.client = await getRedisClient();
    }
    return this.client;
  }
  
  /**
   * Load a script and cache its SHA
   */
  async loadScript(script: LuaScript): Promise<string> {
    const client = await this.getClient();
    const sha = await client.script('LOAD', script.source) as string;
    script.sha = sha;
    this.loadedScripts.set(script.name, sha);
    return sha;
  }
  
  /**
   * Execute script by name with EVALSHA, fallback to EVAL
   */
  async executeScript<T = any>(
    scriptName: string,
    scriptSource: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<T> {
    const client = await this.getClient();
    let sha = this.loadedScripts.get(scriptName);
    
    // Load script if not cached
    if (!sha) {
      sha = await this.loadScript({ name: scriptName, source: scriptSource, numberOfKeys: keys.length });
    }
    
    try {
      // Try to execute with EVALSHA
      return await client.evalsha(sha!, keys.length, ...keys, ...args) as T;
    } catch (error: any) {
      // If script not found on server, load it and retry
      if (error.message.includes('NOSCRIPT')) {
        sha = await this.loadScript({ name: scriptName, source: scriptSource, numberOfKeys: keys.length });
        return await client.evalsha(sha, keys.length, ...keys, ...args) as T;
      }
      throw error;
    }
  }
  
  /**
   * Check if script is loaded
   */
  async scriptExists(sha: string): Promise<boolean> {
    const client = await this.getClient();
    const result = await client.script('EXISTS', sha) as any;
    return result[0] === 1;
  }
  
  /**
   * Flush all loaded scripts from cache
   */
  clearCache(): void {
    this.loadedScripts.clear();
  }
}

// Singleton
let scriptLoader: ScriptLoader | null = null;

export function getScriptLoader(): ScriptLoader {
  if (!scriptLoader) {
    scriptLoader = new ScriptLoader();
  }
  return scriptLoader;
}

export async function executeScript<T = any>(
  scriptName: string,
  scriptSource: string,
  keys: string[],
  args: (string | number)[]
): Promise<T> {
  return getScriptLoader().executeScript<T>(scriptName, scriptSource, keys, args);
}
