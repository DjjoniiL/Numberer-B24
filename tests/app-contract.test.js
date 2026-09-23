const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");

function readRuntimeFile(name) {
  return fs.readFileSync(path.join(projectRoot, name), "utf8");
}

test("install removes the deal detail tab and does not bind it again", () => {
  const installSource = readRuntimeFile("install.js");
  assert.match(installSource, /unbindPlacement\("CRM_DEAL_DETAIL_TAB"\)/);
  assert.doesNotMatch(installSource, /\bbindPlacement\("CRM_DEAL_DETAIL_TAB"/);
});

test("worker uses a short polling interval for faster deal updates", () => {
  const workerSource = readRuntimeFile("worker.js");
  assert.match(workerSource, /const pollMs = 5000;/);
});

test("uses full app name for the page title and short menu title in the UI", () => {
  const indexSource = readRuntimeFile("index.html");
  assert.match(indexSource, /<title>Нумератор сделок - свои правила генерации<\/title>/);
  assert.match(indexSource, /<h1>Нумератор сделок<\/h1>/);
});
