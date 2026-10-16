import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { repoRoot } from "../src/paths.js";

const MARKDOWN = [
  "README.md",
  "README.en.md",
  "docs/como-replicar.md",
  "docs/claude-desktop.md",
  "docs/privacidade.md",
  "docs/estados.md",
  "docs/decisoes.md",
  "prompts/agente-checkout.md",
];

const PT_HEADINGS = [
  "Problema",
  "Solução",
  "Arquitetura",
  "Princípios",
  "Resultados",
  "Como medi",
  "Lições",
  "Riscos e limites",
  "Próximos passos",
  "Como rodar",
  "Estrutura",
  "Fontes",
  "Aviso",
];

const EN_HEADINGS = [
  "Problem",
  "Solution",
  "Architecture",
  "Principles",
  "Results",
  "How I measured",
  "Lessons",
  "Risks and limits",
  "Next steps",
  "How to run",
  "Layout",
  "Sources",
  "Notice",
];

test("READMEs seguem o template e os markdowns não usam travessão", () => {
  const pt = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const en = fs.readFileSync(path.join(repoRoot, "README.en.md"), "utf8");
  for (const heading of PT_HEADINGS) {
    assert.match(pt, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const heading of EN_HEADINGS) {
    assert.match(en, new RegExp(heading));
  }
  for (const file of [pt, en]) {
    assert.match(file, /Renan R\. Rosa, Staff Product Manager \| Payment Infrastructure \| Pix · Open Finance · BaaS · AI/);
    assert.match(file, /https:\/\/www\.linkedin\.com\/in\/renanrrosa/);
    assert.match(file, /\[A CONFIRMAR\]/);
    assert.match(file, /docs\/assets\/preview-1600x900\.png/);
    assert.match(file, /docs\/assets\/antes-depois-1600x900\.png/);
    assert.match(file, /docs\/assets\/jornada-1600x900\.png/);
    assert.equal(file.includes("\u2014"), false);
    assert.equal(file.includes("\u2013"), false);
  }
  for (const relative of MARKDOWN) {
    const text = fs.readFileSync(path.join(repoRoot, relative), "utf8");
    assert.equal(text.includes("\u2014"), false, `${relative} tem em dash`);
    assert.equal(text.includes("\u2013"), false, `${relative} tem en dash`);
    assert.equal(/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(text), false, `${relative} tem CPF formatado`);
  }
});

test("os assets visuais estão em docs/assets", () => {
  for (const name of [
    "preview-1600x900.png",
    "jornada-1600x900.png",
    "jornada-1080x1350.png",
    "antes-depois-1600x900.png",
    "capa-repo-1280x640.png",
  ]) {
    const file = path.join(repoRoot, "docs", "assets", name);
    assert.equal(fs.existsSync(file), true, file);
    assert.ok(fs.statSync(file).size > 10_000);
  }
});
