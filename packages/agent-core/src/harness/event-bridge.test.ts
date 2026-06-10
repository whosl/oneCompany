import { describe, expect, it, vi } from "vitest";
import { createEventBridge } from "./event-bridge.js";

describe("event-bridge — permission idle tracking", () => {
  it("stays busy until onPermission resolves", async () => {
    let resolvePermissionWork!: () => void;
    const permissionWork = new Promise<void>((resolve) => {
      resolvePermissionWork = resolve;
    });

    const client = {
      event: {
        subscribe: vi.fn(async () => ({
          stream: (async function* () {
            yield {
              type: "permission.updated",
              properties: {
                sessionID: "session-1",
                id: "perm-1",
              },
            };
            await permissionWork;
            yield {
              type: "session.idle",
              properties: {
                sessionID: "session-1",
              },
            };
          })(),
        })),
      },
    };

    const bridge = createEventBridge(client as never, {
      sessionId: "session-1",
      directory: "/tmp/repo",
      emit: () => undefined,
      onPermission: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bridge.isIdle()).toBe(false);

    resolvePermissionWork();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (bridge.isIdle()) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(bridge.isIdle()).toBe(true);
    bridge.stop();
  });
});
