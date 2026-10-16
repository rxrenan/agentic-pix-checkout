import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

import { createApp, type App } from "../src/app.js";
import { fixturesDir } from "../src/paths.js";

export function tempApp(options?: { now?: () => Date; consentTtlMs?: number }): {
  app: App;
  dataDir: string;
} {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cafe-aurora-"));
  const app = createApp({
    dataDir,
    fixturesDir,
    now: options?.now,
    consentTtlMs: options?.consentTtlMs,
  });
  return { app, dataDir };
}

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "cpf_formatado", re: /\d{3}\.\d{3}\.\d{3}-\d{2}/ },
  { name: "cpf_11_digitos", re: /(^|[^\d])\d{11}(?!\d)/ },
  { name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "chave_privada", re: /BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/ },
  { name: "aws_key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "openai_key", re: /sk-(?:live|test|proj|ant-|or-)?[A-Za-z0-9]/ },
  { name: "github_token", re: /ghp_[A-Za-z0-9]{20,}/ },
  { name: "slack_token", re: /xox[baprs]-/ },
  { name: "bearer", re: /Bearer\s+[A-Za-z0-9\-_]{8,}/ },
  { name: "telefone_br", re: /\+55\d{10,11}/ },
];

const FORBIDDEN_JSON_KEYS = ["cpf", "email", "phone", "telefone", "password", "senha", "api_key", "secret", "private_key", "token"];

export function assertNoPersonalData(label: string, text: string) {
  for (const pattern of SECRET_PATTERNS) {
    const found = text.match(pattern.re);
    assert.equal(found, null, `${label} contém ${pattern.name}: ${found?.[0] ?? ""}`);
  }
  const lowered = text.toLowerCase();
  for (const key of FORBIDDEN_JSON_KEYS) {
    assert.equal(
      lowered.includes(`"${key}"`),
      false,
      `${label} contém o campo ${key}`,
    );
  }
}
