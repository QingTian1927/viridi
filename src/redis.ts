/**
 * Redis wrapper for Upstash REST API
 */

import { config } from "./config.js";

interface RedisCommandResponse {
  result?: unknown;
  error?: string;
}

export class RedisClient {
  private url: string;
  private token: string;

  constructor() {
    this.url = config.redis.url;
    this.token = config.redis.token;
  }

  private async execute(command: string[]): Promise<unknown> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(
        `Redis request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as RedisCommandResponse;
    if (data.error) {
      throw new Error(`Redis error: ${data.error}`);
    }

    return data.result;
  }

  async set(key: string, value: string, exSeconds?: number): Promise<void> {
    const command: string[] = ["SET", key, value];
    if (exSeconds) {
      command.push("EX", exSeconds.toString());
    }
    await this.execute(command);
  }

  async get(key: string): Promise<string | null> {
    const result = await this.execute(["GET", key]);
    return (result as string) ?? null;
  }

  async del(key: string): Promise<void> {
    await this.execute(["DEL", key]);
  }

  async setNX(key: string, value: string, exSeconds: number): Promise<boolean> {
    const result = await this.execute(["SET", key, value, "NX", "EX", exSeconds.toString()]);
    return result === "OK";
  }

  async append(key: string, value: string): Promise<void> {
    await this.execute(["APPEND", key, value]);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const result = await this.execute(["LRANGE", key, start.toString(), stop.toString()]);
    return (result as string[]) ?? [];
  }

  async rpush(key: string, ...values: string[]): Promise<void> {
    const command: string[] = ["RPUSH", key, ...values];
    await this.execute(command);
  }

  async del_pattern(pattern: string): Promise<void> {
    // Note: Upstash has SCAN support, but for simplicity in MVP we won't use pattern deletion
    // If needed, this can be expanded
    throw new Error("Pattern deletion not implemented. Use explicit key deletion.");
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.execute(["EXISTS", key]);
    return (result as number) === 1;
  }

  async eval(script: string, numKeys: number, ...args: string[]): Promise<unknown> {
    return await this.execute(["EVAL", script, numKeys.toString(), ...args]);
  }

  async getJSON(key: string): Promise<unknown> {
    const str = await this.get(key);
    if (!str) return null;
    return JSON.parse(str);
  }

  async setJSON(key: string, value: unknown, exSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), exSeconds);
  }
}

export const redis = new RedisClient();
