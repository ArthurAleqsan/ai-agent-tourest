import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { healthStatusSchema } from "@tourest/shared";
import { createContainer, type AppContainer } from "../src/core/di/container";
import { createServer } from "../src/server";

describe("GET /api/health", () => {
  let container: AppContainer;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    container = createContainer({ databasePath: ":memory:" });
    const app = createServer(container);
    await new Promise<void>((done) => {
      server = app.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${port}`;
        done();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
    container.shutdown();
  });

  it("returns 200 with a valid health payload", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);

    const json = await res.json();
    const parsed = healthStatusSchema.parse(json);
    expect(parsed.status).toBe("ok");
    expect(parsed.checks.database).toBe("ok");
    expect(parsed.service).toBe("Tourest AI Lead Hunter");
  });
});
