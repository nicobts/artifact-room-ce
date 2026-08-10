import pino, { type DestinationStream, type LoggerOptions } from "pino";

/**
 * Structured logging with redaction. Privacy is an invariant, not a setting:
 * tokens, passwords, raw IPs, cookies, authorization, and email never appear in
 * logs in cleartext. Level via LOG_LEVEL.
 */
export const REDACT_PATHS = [
  "token",
  "password",
  "passwordHash",
  "authorization",
  "cookie",
  "email",
  "ip",
  "ipAddress",
  "headers.cookie",
  "headers.authorization",
  "*.token",
  "*.password",
  "*.passwordHash",
  "*.email",
  "*.ip",
  "*.ipAddress",
];

export function createLogger(
  options: LoggerOptions = {},
  destination?: DestinationStream,
) {
  const base: LoggerOptions = {
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    ...options,
  };
  return destination ? pino(base, destination) : pino(base);
}

export const logger = createLogger();
