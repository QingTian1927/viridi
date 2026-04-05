/**
 * Configuration management for Viridi
 * Reads from environment variables
 */

interface Config {
  redis: {
    url: string;
    token: string;
  };
  resend: {
    apiKey: string;
  };
  email: {
    fromAddress: string;
    toAddress: string;
  };
  thresholds: {
    gas: {
      majorPct: number;
      majorVnd: number;
    };
    gold: {
      majorPct: number;
      majorVnd: number;
    };
  };
  timezone: string;
}

export function loadConfig(): Config {
  const requiredEnvVars = [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "RESEND_API_KEY",
    "ALERT_FROM_EMAIL",
    "ALERT_TO_EMAIL",
  ];

  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
  }

  return {
    redis: {
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY!,
    },
    email: {
      fromAddress: process.env.ALERT_FROM_EMAIL!,
      toAddress: process.env.ALERT_TO_EMAIL!,
    },
    thresholds: {
      gas: {
        majorPct: parseFloat(process.env.GAS_MAJOR_PCT ?? "1"),
        majorVnd: parseInt(process.env.GAS_MAJOR_VND ?? "1000"),
      },
      gold: {
        majorPct: parseFloat(process.env.GOLD_MAJOR_PCT ?? "3"),
        majorVnd: parseInt(process.env.GOLD_MAJOR_VND ?? "300000"),
      },
    },
    timezone: process.env.TZ ?? "Asia/Ho_Chi_Minh",
  };
}

export const config = loadConfig();
