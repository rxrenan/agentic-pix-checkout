import path from "node:path";

const port = process.env.PORT ?? "8787";

function usage() {
  process.stderr.write(
    [
      "Uso:",
      "  npm run aprovar -- --consent cns_xxx --decision approve",
      "  npm run aprovar -- --consent cns_xxx --decision reject",
      "",
      "O servidor MCP precisa estar no ar (npm run mcp). A frase de aprovação simulada é fixa.",
      "Esta CLI fala só com 127.0.0.1.",
      "",
    ].join("\n"),
  );
}

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const consent = arg("--consent");
  const decision = arg("--decision");
  if (!consent || (decision !== "approve" && decision !== "reject")) {
    usage();
    process.exit(1);
  }
  const body: Record<string, string> = {
    decision,
    customer_id: "cust_demo_001",
  };
  if (decision === "approve") {
    body.method = "simulated_biometric";
    body.confirmation_phrase = "CONFIRMO O PIX";
  }
  const response = await fetch(`http://127.0.0.1:${port}/consents/${encodeURIComponent(consent)}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  process.stdout.write(`${text}\n`);
  if (!response.ok) process.exit(1);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked.endsWith(`${path.sep}approve.ts`) || invoked.endsWith(`${path.sep}approve.js`)) {
  main().catch((error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${text}\n`);
    process.exit(1);
  });
}
