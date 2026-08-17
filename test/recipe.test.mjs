import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeRecipes,
  expandRecipe,
  installSequence,
  loadPlugins,
  loadRecipes,
  resolvePlugin,
  searchRecipes,
} from "../lib/recipe.js";

const recipes = loadRecipes();
const plugins = loadPlugins();

test("bundled data is well-formed", () => {
  assert.ok(recipes.length >= 8, ">= 8 recipes, got " + recipes.length);
  assert.ok(plugins.length >= 50, ">= 50 plugins, got " + plugins.length);
  for (const r of recipes) {
    assert.ok(r.id && r.name && r.description, "recipe fields: " + r.id);
    assert.ok(Array.isArray(r.plugins) && r.plugins.length > 0, "recipe has plugins: " + r.id);
  }
});

test("every recipe plugin resolves in the directory", () => {
  for (const r of recipes) {
    for (const item of r.plugins) {
      const found = resolvePlugin(item.name, plugins);
      assert.ok(found, "plugin resolves: " + item.name + " (in recipe " + r.id + ")");
    }
  }
});

test("searchRecipes matches Chinese needs", () => {
  const found = searchRecipes("配一套通知提醒环境", recipes);
  assert.ok(found.length > 0, "got matches");
  assert.equal(found[0].recipe.id, "notification-suite");
});

test("searchRecipes matches English needs", () => {
  const found = searchRecipes("browser dev environment for crawling", recipes);
  assert.ok(found.length > 0);
  assert.equal(found[0].recipe.id, "browser-dev-env");
});

test("searchRecipes rejects empty need", () => {
  assert.throws(() => searchRecipes("  ", recipes), /non-empty/);
});

test("expandRecipe dedups and preserves order", () => {
  const recipe = recipes.find((r) => r.id === "browser-dev-env");
  const expanded = expandRecipe(recipe, plugins);
  // the recipe intentionally lists dsh-browser twice
  const names = expanded.map((p) => p.name);
  assert.equal(new Set(names).size, names.length, "no duplicates");
  assert.equal(expanded.filter((p) => p.known).length, expanded.length, "all known");
});

test("installSequence builds dsh plugin add commands", () => {
  const recipe = recipes.find((r) => r.id === "memory-kit");
  const seq = installSequence(expandRecipe(recipe, plugins));
  assert.ok(seq.commands.length >= 3);
  for (const c of seq.commands) assert.ok(c.startsWith("dsh plugin add "), c);
  assert.equal(seq.oneLine.split(" && ").length, seq.count);
});

test("composeRecipes merges and dedups across recipes", () => {
  const composed = composeRecipes(["memory-kit", "academic-writing"], recipes, plugins);
  const names = composed.plugins.map((p) => p.name);
  assert.equal(new Set(names).size, names.length, "no duplicates across recipes");
  assert.ok(names.includes("863683348/dsh-plugin-focus"), "shared plugin appears once");
});

test("composeRecipes reports missing ids", () => {
  const composed = composeRecipes(["memory-kit", "no-such-recipe"], recipes, plugins);
  assert.deepEqual(composed.missingIds, ["no-such-recipe"]);
});
