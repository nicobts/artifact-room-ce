import { describe, it, expect } from "vitest";
import type { DestinationStream } from "pino";
import { createLogger } from "@/lib/log";

describe("logger redaction", () => {
  it("redacts secrets and PII, never emitting them in cleartext", () => {
    const lines: string[] = [];
    const stream: DestinationStream = {
      write: (s: string) => {
        lines.push(s);
      },
    };
    const log = createLogger({}, stream);

    log.info(
      {
        token: "sekret-token",
        password: "pw12345",
        user: { email: "jane@acme.com" },
        ip: "203.0.113.7",
        headers: { cookie: "session=abc" },
      },
      "request",
    );

    const out = lines.join("");
    expect(out).toContain("[redacted]");
    expect(out).not.toContain("sekret-token");
    expect(out).not.toContain("pw12345");
    expect(out).not.toContain("jane@acme.com");
    expect(out).not.toContain("203.0.113.7");
    expect(out).not.toContain("session=abc");
  });
});
