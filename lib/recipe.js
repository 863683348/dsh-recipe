/**
 * dsh-recipe — pure recipe logic: search, expand, compose.
 * Zero DSH/Cordis imports; unit-testable.
 *
 * A recipe is a scenario bundle: an ordered plugin list with optional
 * config — "plugin界的 dotfiles". expandRecipe resolves names against the
 * bundled plugin directory and dedups; composeRecipe merges several recipes.
 * @module dsh-recipe/recipe
 */
import { readFileSync } from "node:fs";

/** Load the bundled plugin directory. */
export function loadPlugins() {
  const parsed = JSON.parse(readFileSync(new URL("./plugins.json", import.meta.url), "utf8"));
  return parsed.plugins ?? [];
}

/** Load the bundled recipes. */
export function loadRecipes() {
  const parsed = JSON.parse(readFileSync(new URL("./recipe-data.json", import.meta.url), "utf8"));
  return parsed.recipes ?? [];
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "my", "i", "me", "want", "need", "do", "is", "are", "it", "that", "this", "dsh", "plugin", "plugins", "harness", "deepseek"]);

function tokensOf(text) {
  const out = new Set();
  const lower = String(text).toLowerCase();
  for (const w of lower.split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  const runs = lower.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const run of runs) {
    for (let i = 0; i + 2 <= run.length; i++) out.add(run.slice(i, i + 2));
    if (run.length >= 3) out.add(run);
  }
  return [...out];
}

/** Score a recipe against a need (name/desc/tags weighted). */
export function scoreRecipe(recipe, need) {
  const terms = tokensOf(need);
  if (terms.length === 0) return { score: 0, hits: [] };
  let score = 0;
  const hits = [];
  const nameText = (recipe.name + " " + recipe.nameZh).toLowerCase();
  const bodyText = (recipe.description + " " + recipe.descriptionZh + " " + recipe.tags.join(" ")).toLowerCase();
  for (const t of terms) {
    if (nameText.includes(t)) {
      score += 3;
      hits.push(t);
    } else if (bodyText.includes(t)) {
      score += 1;
      hits.push(t);
    }
  }
  return { score, hits: [...new Set(hits)].slice(0, 5) };
}

/** Search recipes by a natural-language need. */
export function searchRecipes(need, recipes = loadRecipes()) {
  if (typeof need !== "string" || need.trim().length === 0) {
    throw new Error('recipe: "need" must be a non-empty string');
  }
  return recipes
    .map((recipe) => ({ recipe, ...scoreRecipe(recipe, need) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
}

/** Resolve one plugin entry by name; returns undefined when unknown. */
export function resolvePlugin(name, plugins = loadPlugins()) {
  return plugins.find((p) => p.name === name);
}

/**
 * Expand a recipe into an ordered, deduped plugin list (with directory data).
 * Unknown names are reported as missing rather than dropped silently.
 */
export function expandRecipe(recipe, plugins = loadPlugins()) {
  const seen = new Set();
  const list = [];
  for (const item of recipe.plugins ?? []) {
    const name = item.name;
    if (seen.has(name)) continue;
    seen.add(name);
    const info = resolvePlugin(name, plugins);
    list.push({
      name,
      url: info?.url ?? null,
      category: info?.category ?? "unknown",
      config: item.config ?? undefined,
      known: info !== undefined,
    });
  }
  return list;
}

/** Build the install command sequence for an expanded recipe. */
export function installSequence(expanded) {
  const commands = expanded
    .filter((p) => p.known)
    .map((p) => "dsh plugin add " + (p.url ?? p.name));
  return {
    commands,
    oneLine: commands.join(" && "),
    count: commands.length,
  };
}

/** Compose several recipes into one deduped plugin list (first-seen order). */
export function composeRecipes(ids, recipes = loadRecipes(), plugins = loadPlugins()) {
  const known = new Map(recipes.map((r) => [r.id, r]));
  const seen = new Set();
  const list = [];
  const missingIds = [];
  for (const id of ids) {
    const recipe = known.get(id);
    if (!recipe) {
      missingIds.push(id);
      continue;
    }
    for (const item of expandRecipe(recipe, plugins)) {
      if (seen.has(item.name)) continue;
      seen.add(item.name);
      list.push(item);
    }
  }
  return { recipes: ids.map((id) => known.get(id)).filter(Boolean), plugins: list, missingIds };
}