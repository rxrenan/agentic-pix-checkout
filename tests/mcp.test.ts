import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { test } from "node:test";

import { DEMO_CUSTOMER_ID } from "../src/app.js";
import { openMcp, parseTool } from "../src/mcp/session.js";
import { repoRoot } from "../src/paths.js";

test("stdio MCP lista só as ferramentas da loja e o checkout não liquida", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cafe-mcp-"));
  const session = await openMcp({ DATA_DIR: dataDir, PORT: "0" });
  try {
    const listed = (await session.request("tools/list")) as { tools: Array<{ name: string }> };
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [
        "list_catalog",
        "get_habitual_order",
        "upsert_cart",
        "get_cart",
        "start_checkout",
        "get_payment_status",
      ],
    );
    parseTool(
      await session.request("tools/call", {
        name: "upsert_cart",
        arguments: {
          customer_id: DEMO_CUSTOMER_ID,
          items: [{ sku: "cafe-coado-200", qty: 1 }],
        },
      }),
    );
    const intent = parseTool<{ status: string; approval_id: null; intent_id: string }>(
      await session.request("tools/call", {
        name: "start_checkout",
        arguments: { customer_id: DEMO_CUSTOMER_ID, idempotency_key: "mcp-test-0001" },
      }),
    );
    assert.equal(intent.status, "awaiting_user_approval");
    assert.equal(intent.approval_id, null);

    const denied = (await session.request("tools/call", {
      name: "settle_pix",
      arguments: { intent_id: intent.intent_id },
    })) as { isError?: boolean };
    assert.equal(denied.isError, true);
  } finally {
    await session.close();
  }
});

test("DEMO_MODE=false não sobe o servidor", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", path.join(repoRoot, "src/mcp/server.ts")], {
    cwd: repoRoot,
    env: { ...process.env, DEMO_MODE: "false" },
  });
  const stderr: Buffer[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  const code = await new Promise<number | null>((resolve) => child.on("exit", resolve));
  assert.equal(code, 1);
  assert.match(Buffer.concat(stderr).toString("utf8"), /Modo real não existe/);
});
