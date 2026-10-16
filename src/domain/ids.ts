import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function nid(prefix: string): string {
  const bytes = randomBytes(10);
  let body = "";
  for (let i = 0; i < 10; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `${prefix}_${body}`;
}

export function endToEndId(now: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    now.getUTCFullYear().toString() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes());
  const bytes = randomBytes(11);
  let tail = "";
  for (let i = 0; i < 11; i++) {
    tail += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  const value = `E00000000${stamp}${tail}`;
  if (value.length !== 32) {
    throw new Error(`endToEndId com tamanho ${value.length}, esperado 32.`);
  }
  return value;
}
