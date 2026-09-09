import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ExperienceWorkflowResource } from "../dist/index.mjs";

test("every native workflow transport resolves to the exported backend contract", async () => {
  const contract = JSON.parse(readFileSync(new URL("../contracts/openapi-routes.json", import.meta.url), "utf8"));
  const routes = Object.entries(contract.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map(method => [method, new RegExp("^" + path.replace(/\{[^}]+\}/g, "[^/]+") + "$")]));
  const seen = [];
  const client = new ExperienceWorkflowResource(new Proxy({}, { get: (_, method) =>
    async (path) => { seen.push([method, path]); return {}; } }));
  const methods = Object.getOwnPropertyNames(ExperienceWorkflowResource.prototype).filter(x => x !== "constructor");
  for (const method of methods) await client[method]("contract-id", {});
  assert.ok(seen.length === methods.length && methods.length >= 20);
  for (const [method, path] of seen)
    assert.ok(routes.some(([verb, pattern]) => verb === method && pattern.test(path)), `${method} ${path}`);
});
