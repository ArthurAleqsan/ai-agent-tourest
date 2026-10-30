import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createContainer, type AppContainer } from "../src/core/di/container";
import { createServer } from "../src/server";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("admin HTTP auth gate", () => {
  let container: AppContainer;
  let db: TestDb;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    db = createTestDb();
    container = createContainer({
      databasePath: db.databasePath,
      adminPassword: "secret-pass",
      adminUsername: "admin",
    });
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
    db.cleanup();
  });

  it("keeps health public and gates /api/leads", async () => {
    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);

    const denied = await fetch(`${baseUrl}/api/leads`);
    expect(denied.status).toBe(401);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "secret-pass" }),
    });
    expect(login.status).toBe(200);
    const { token } = (await login.json()) as { token: string };

    const ok = await fetch(`${baseUrl}/api/leads`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ok.status).toBe(200);
  });
});
