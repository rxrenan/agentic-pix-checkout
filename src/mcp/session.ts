import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

import { repoRoot } from "../paths.js";

type Rpc = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
  method?: string;
};

export type McpSession = {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  notify(method: string, params?: Record<string, unknown>): void;
  port: number;
  stderr: string;
  close: () => Promise<void>;
};

export async function openMcp(env: NodeJS.ProcessEnv & { DATA_DIR: string }): Promise<McpSession> {
  const child: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    ["--import", "tsx", path.join(repoRoot, "src/mcp/server.ts")],
    {
      cwd: repoRoot,
      env: { ...process.env, ...env, DEMO_MODE: "true" },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

  let stderr = "";
  let port = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let nextId = 1;
  let closed = false;

  const failAll = (error: Error) => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };

  child.on("exit", (code) => {
    closed = true;
    if (pending.size > 0) {
      failAll(new Error(`Servidor MCP encerrou (código ${code ?? "?"}). ${stderr}`));
    }
  });

  const stdout = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  stdout.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message: Rpc;
    try {
      message = JSON.parse(trimmed) as Rpc;
    } catch {
      failAll(new Error(`Stdout do MCP não é JSON: ${trimmed}`));
      return;
    }
    if (message.id === undefined || message.id === null) return;
    const waiter = pending.get(Number(message.id));
    if (!waiter) return;
    pending.delete(Number(message.id));
    if (message.error) {
      waiter.reject(new Error(`${message.error.code} ${message.error.message}`));
      return;
    }
    waiter.resolve(message.result);
  });

  const ready = new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`MCP não ficou pronto. stderr: ${stderr}`));
    }, 15_000);
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      const match = stderr.match(/itp_ready port=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`MCP saiu antes do ready (código ${code ?? "?"}). ${stderr}`));
    });
  });

  port = await ready;

  const request = (method: string, params?: Record<string, unknown>) => {
    if (closed) return Promise.reject(new Error("Sessão MCP fechada."));
    const id = nextId++;
    const payload: Record<string, unknown> = { jsonrpc: "2.0", id, method };
    if (params) payload.params = params;
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  };

  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "cafe-aurora-demo", version: "0.1.0" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  return {
    request,
    notify(method, params) {
      const payload: Record<string, unknown> = { jsonrpc: "2.0", method };
      if (params) payload.params = params;
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    },
    get port() {
      return port;
    },
    get stderr() {
      return stderr;
    },
    async close() {
      closed = true;
      child.stdin.end();
      child.kill();
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
          return;
        }
        child.once("exit", () => resolve());
        setTimeout(() => resolve(), 1000);
      });
    },
  };
}

export function toolText(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content;
  if (!content?.[0]?.text) {
    throw new Error("Resposta MCP sem texto.");
  }
  return content[0].text;
}

export function parseTool<T>(result: unknown): T {
  const envelope = result as { isError?: boolean };
  const parsed = JSON.parse(toolText(result)) as T & { error?: { code: string; message: string } };
  if (envelope.isError) {
    const code = parsed.error?.code ?? "tool_error";
    const message = parsed.error?.message ?? "ferramenta falhou";
    throw new Error(`${code}: ${message}`);
  }
  return parsed;
}
