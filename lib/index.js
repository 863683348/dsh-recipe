/**
 * dsh-recipe — a model-facing `recipe` tool: scenario bundles of plugins
 * ("插件界的 dotfiles"). Given a goal like "browser dev environment" or
 * "通知全家桶", it returns the matched recipe, the ordered plugin list with
 * install commands, and the ability to compose several recipes into one
 * environment. No network, no LLM calls, no external deps.
 *
 * @module dsh-recipe
 */
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import {
  composeRecipes,
  expandRecipe,
  installSequence,
  loadPlugins,
  loadRecipes,
  searchRecipes,
} from "./recipe.js";

/** Cordis plugin name (registered with the loader). */
const name = "recipe";

/** Services this plugin must resolve before it applies. */
const inject = ["tools", "systemPrompt"];

/** Composition-row configuration. */
const Config = z.object({
  /** Prompt section order (ascending; persona is 0). */
  sectionOrder: z.number().default(5),
});

const RECIPE_SECTION_TEXT = 'The `recipe` tool bundles dsh plugins into ready-made environments ("插件界的 dotfiles"): when the user asks for a whole setup or scenario — "配一套浏览器开发环境", "学术写作套装", "通知全家桶" — call `recipe` (action `search` or `apply`) instead of installing plugins one by one. It returns the ordered plugin list and the exact `dsh plugin add` commands.';

/** Summary shape of one recipe for list/search results. */
function summaryOf(recipe, plugins) {
  return {
    id: recipe.id,
    name: recipe.name,
    nameZh: recipe.nameZh,
    description: recipe.description,
    descriptionZh: recipe.descriptionZh,
    tags: recipe.tags ?? [],
    pluginCount: new Set(recipe.plugins.map((p) => p.name)).size,
  };
}

/**
 * Register the `recipe` tool and the guidance section.
 * @param ctx - registrant context.
 * @param config - validated plugin configuration.
 */
function apply(ctx, config) {
  const recipes = loadRecipes();
  const plugins = loadPlugins();

  ctx.tools.register(defineTool({
    name: "recipe",
    description: "Scenario bundles of dsh plugins ('插件界的 dotfiles'): list ready-made environments, search them by need, apply one, or compose several into an ordered install sequence with exact `dsh plugin add` commands. Use when the user asks for a whole setup or combination of plugins, not a single one.",
    parameters: {
      action: {
        type: "string",
        required: true,
        enum: ["list", "search", "apply", "compose"],
        description: "list = all recipes; search = match by need; apply = expand one recipe by id or need; compose = merge several recipes by id (comma-separated).",
      },
      need: {
        type: "string",
        description: "Natural-language goal (English or Chinese), for search/apply.",
      },
      recipeId: {
        type: "string",
        description: "Recipe id (apply), or comma-separated ids (compose).",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: true,
        properties: {
          action: { type: "string", required: true },
          recipes: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              required: true,
              properties: {
                id: { type: "string", required: true },
                name: { type: "string", required: true },
                nameZh: { type: "string", required: true },
                description: { type: "string", required: true },
                descriptionZh: { type: "string", required: true },
                tags: { type: "array", required: true, items: { type: "string" } },
                pluginCount: { type: "integer", required: true },
              },
            },
          },
          plugins: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              required: true,
              properties: {
                name: { type: "string", required: true },
                url: { type: "string" },
                category: { type: "string", required: true },
                known: { type: "boolean", required: true },
              },
            },
          },
          commands: {
            type: "array",
            required: true,
            items: { type: "string" },
          },
          oneLine: { type: "string", required: true },
        },
      },
      render: (_args, value) => {
        const lines = ["recipe " + value.action + ":"];
        for (const r of value.recipes) {
          lines.push("## " + r.name + " / " + r.nameZh + " [" + r.id + "] (" + r.pluginCount + " plugins)");
          lines.push(r.description);
          if (r.descriptionZh) lines.push(r.descriptionZh);
          lines.push("tags: " + r.tags.join(", "));
          lines.push("");
        }
        for (const p of value.plugins) {
          const mark = p.known ? "" : " (MISSING from directory)";
          lines.push("- " + p.name + " [" + p.category + "]" + mark);
        }
        if (value.commands.length > 0) {
          lines.push("", "install sequence:", ...value.commands.map((c) => "  " + c));
          lines.push("", "one line:", "  " + value.oneLine);
        }
        return [{ type: "text", text: lines.join("\n") }];
      },
    },
    execute: async (args) => {
      const action = args.action ?? "search";
      let recipesOut = [];
      let pluginsOut = [];
      let commands = [];
      if (action === "list") {
        recipesOut = recipes.map((r) => summaryOf(r, plugins));
      } else if (action === "search") {
        const found = searchRecipes(String(args.need ?? ""), recipes);
        recipesOut = found.map(({ recipe }) => summaryOf(recipe, plugins));
      } else if (action === "apply") {
        const recipe = recipes.find((r) => r.id === args.recipeId)
          ?? (args.need ? searchRecipes(String(args.need), recipes)[0]?.recipe : undefined);
        if (!recipe) throw new Error("recipe: no recipe found for " + (args.recipeId ?? args.need));
        pluginsOut = expandRecipe(recipe, plugins);
        const seq = installSequence(pluginsOut);
        commands = seq.commands;
        recipesOut = [summaryOf(recipe, plugins)];
        return { action, recipes: recipesOut, plugins: pluginsOut.map((p) => ({ name: p.name, url: p.url, category: p.category, known: p.known })), commands, oneLine: seq.oneLine };
      } else if (action === "compose") {
        const ids = String(args.recipeId ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        if (ids.length === 0) throw new Error('recipe: "recipeId" is required for compose (comma-separated ids)');
        const composed = composeRecipes(ids, recipes, plugins);
        if (composed.missingIds.length > 0) {
          throw new Error("recipe: unknown recipe id(s): " + composed.missingIds.join(", "));
        }
        pluginsOut = composed.plugins;
        const seq = installSequence(pluginsOut);
        commands = seq.commands;
        recipesOut = composed.recipes.map((r) => summaryOf(r, plugins));
        return { action, recipes: recipesOut, plugins: pluginsOut.map((p) => ({ name: p.name, url: p.url, category: p.category, known: p.known })), commands, oneLine: seq.oneLine };
      } else {
        throw new Error('recipe: unknown action "' + action + '"');
      }
      return { action, recipes: recipesOut, plugins: [], commands, oneLine: commands.join(" && ") };
    },
    presentCall: (args) => ({
      card: "generic",
      title: "Recipe: " + (args.action ?? "search") + (args.recipeId ? " " + args.recipeId : args.need ? " " + String(args.need).slice(0, 40) : ""),
      kind: "other",
      rawInput: args,
    }),
  }));

  ctx.effect(() => ctx.systemPrompt.section({
    name: "recipe:instructions",
    order: config.sectionOrder,
    text: RECIPE_SECTION_TEXT,
  }), "recipe.section()");
}

export { Config, RECIPE_SECTION_TEXT, apply, inject, name };
