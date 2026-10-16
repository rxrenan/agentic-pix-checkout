import http from "node:http";

import type { App } from "../app.js";
import { CONFIRMATION_PHRASE } from "../app.js";
import { AppError, errorBody } from "../errors.js";

export type ApprovalServer = {
  port: number;
  close: () => Promise<void>;
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16_384) {
        reject(new AppError("body_too_large", "Corpo maior que 16 KB.", 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

export function startApprovalServer(app: App, port = 8787): Promise<ApprovalServer> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const pathName = url.pathname;

      if (req.method === "GET" && pathName === "/health") {
        send(res, 200, { ok: true, mode: "demo", service: "itp_simulado" });
        return;
      }

      const consent = pathName.match(/^\/consents\/([^/]+)$/);
      if (req.method === "GET" && consent) {
        send(res, 200, app.getConsent(decodeURIComponent(consent[1]!)));
        return;
      }

      const decision = pathName.match(/^\/consents\/([^/]+)\/decision$/);
      if (req.method === "POST" && decision) {
        const raw = await readBody(req);
        const body = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const consentId = decodeURIComponent(decision[1]!);
        const customerId = typeof body.customer_id === "string" ? body.customer_id : "";
        if (body.decision === "approve") {
          const approved = app.approve(consentId, {
            customerId,
            method: typeof body.method === "string" ? body.method : "",
            confirmationPhrase:
              typeof body.confirmation_phrase === "string" ? body.confirmation_phrase : "",
          });
          const settled = app.settle(approved.intent_id);
          send(res, 200, settled);
          return;
        }
        if (body.decision === "reject") {
          send(res, 200, app.reject(consentId, { customerId }));
          return;
        }
        throw new AppError("invalid_decision", "decision precisa ser approve ou reject.");
      }

      const payment = pathName.match(/^\/payments\/([^/]+)$/);
      if (req.method === "GET" && payment) {
        send(res, 200, app.getPayment(decodeURIComponent(payment[1]!)));
        return;
      }

      const settle = pathName.match(/^\/payments\/([^/]+)\/settle$/);
      if (req.method === "POST" && settle) {
        send(res, 200, app.settle(decodeURIComponent(settle[1]!)));
        return;
      }

      send(res, 404, {
        error: { code: "not_found", message: "Rota não encontrada no ITP simulado." },
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        send(res, 400, { error: { code: "invalid_json", message: "JSON inválido." } });
        return;
      }
      if (error instanceof AppError) {
        send(res, error.httpStatus, errorBody(error));
        return;
      }
      send(res, 500, { error: { code: "internal", message: "Falha interna do ITP simulado." } });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Não foi possível ler a porta do ITP simulado."));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}

export { CONFIRMATION_PHRASE };
