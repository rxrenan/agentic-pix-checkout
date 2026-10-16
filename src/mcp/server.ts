import readline from "node:readline";
import path from "node:path";

import { createApp } from "../app.js";
import { startApprovalServer } from "../itp/http.js";
import { fixturesDir, repoRoot } from "../paths.js";

type JsonRpc = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

const PROTOCOL = "2024-11-05";

function send(message: unknown) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id: number | string | null | undefined, result: unknown) {
  send({ jsonrpc: "2.0", id: id ?? null, result });
}

function fail(id: number | string | null | undefined, code: number, message: string) {
  send({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

async function main() {
  if (process.env.DEMO_MODE === "false") {
    process.stderr.write(
      "Modo real não existe neste repositório. Não há credencial para preencher. Use DEMO_MODE=true.\n",
    );
    process.exit(1);
  }

  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(repoRoot, "data");
  const fixtures = process.env.FIXTURES_DIR ? path.resolve(process.env.FIXTURES_DIR) : fixturesDir;
  const ttl = process.env.CONSENT_TTL_MS ? Number(process.env.CONSENT_TTL_MS) : undefined;
  const app = createApp({
    dataDir,
    fixturesDir: fixtures,
    consentTtlMs: ttl && Number.isFinite(ttl) ? ttl : undefined,
  });
  const requestedPort = process.env.PORT ? Number(process.env.PORT) : 8787;
  const approval = await startApprovalServer(app, requestedPort);
  process.stderr.write(`itp_ready port=${approval.port}\n`);

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: JsonRpc;
    try {
      message = JSON.parse(trimmed) as JsonRpc;
    } catch {
      fail(null, -32700, "Parse error");
      return;
    }
    const id = message.id;
    const method = message.method;
    if (!method) {
      if (id !== undefined) fail(id, -32600, "Invalid Request");
      return;
    }
    if (method === "notifications/initialized" || method === "initialized" || method.startsWith("notifications/")) {
      return;
    }
    try {
      if (method === "initialize") {
        reply(id, {
          protocolVersion: PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "cafe-aurora", version: "0.1.0" },
          instructions:
            "Demo do Café Aurora. start_checkout cria um Pix simulado em awaiting_user_approval. Você não tem ferramenta para aprovar nem liquidar. Diga ao usuário para confirmar no app do banco simulado. Só chame o pedido de pago quando get_payment_status devolver settled.",
        });
        return;
      }
      if (method === "ping") {
        reply(id, {});
        return;
      }
      if (method === "tools/list") {
        reply(id, { tools: app.listTools() });
        return;
      }
      if (method === "tools/call") {
        const params = message.params ?? {};
        const name = typeof params.name === "string" ? params.name : "";
        const result = app.callTool(name, params.arguments ?? {});
        reply(id, result);
        return;
      }
      if (id === undefined) return;
      fail(id, -32601, `Method not found: ${method}`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "internal error";
      if (id === undefined) {
        process.stderr.write(`mcp_error ${text}\n`);
        return;
      }
      fail(id, -32603, text);
    }
  });
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked.endsWith(`${path.sep}server.ts`) || invoked.endsWith(`${path.sep}server.js`)) {
  main().catch((error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mcp_fatal ${text}\n`);
    process.exit(1);
  });
}
