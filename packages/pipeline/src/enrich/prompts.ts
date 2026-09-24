import type { CatalogEntry } from "iconmatch";
import type { ChatMessage } from "./provider.js";

/** Bump whenever the system prompt, few-shots or user template change. */
export const PROMPT_VERSION = "text-v1";

/** Spec §6.3 prompt requirements 1–4. */
export const SYSTEM_PROMPT = `You label icons so they can be found when someone searches for a category name in a personal organisation app (for example "Dog grooming", "Super contributions", "Kids' ski gear").

For each icon you get its name, tags and category. Reply with JSON only, matching the given schema:
- "description": one literal sentence (max 160 characters) saying what the icon clearly shows, based only on its name and tags. No speculation.
- "concepts": 5 to 15 things this icon could stand for, lowercase, 1 to 3 words each. Include common metaphorical uses (lightbulb -> idea, anchor -> stability) and everyday category names a person might type. Leave out anything the icon would not plausibly represent.
- "domains": 1 to 5 broad areas such as "finance", "pets", "sport", "home", "health", "work".

Interface and action glyphs (arrows, carets, toolbar symbols) get few everyday concepts; don't invent categories for them.`;

export interface IconInput {
  name: string;
  label: string;
  tags: string[];
  categories: string[];
}

export function userMessage(icon: IconInput): string {
  return [
    `Icon name: ${icon.name}`,
    `Label: ${icon.label}`,
    `Tags: ${icon.tags.length ? icon.tags.join(", ") : "(none)"}`,
    `Category: ${icon.categories.length ? icon.categories.join(", ") : "(none)"}`,
  ].join("\n");
}

/** Three few-shot examples (spec §6.3 rule 5): literal object, abstract symbol, UI/action glyph. */
export const FEW_SHOTS: {
  icon: IconInput;
  reply: { description: string; concepts: string[]; domains: string[] };
}[] = [
  {
    icon: {
      name: "piggy-bank",
      label: "Piggy bank",
      tags: ["money", "savings", "coin"],
      categories: ["e-commerce"],
    },
    reply: {
      description: "A piggy bank with a coin slot on its back.",
      concepts: [
        "savings",
        "money box",
        "super",
        "retirement fund",
        "budget",
        "pocket money",
        "rainy day fund",
        "investing",
      ],
      domains: ["finance", "family"],
    },
  },
  {
    icon: {
      name: "anchor",
      label: "Anchor",
      tags: ["sea", "boat", "ship", "port"],
      categories: ["map"],
    },
    reply: {
      description: "A ship's anchor with a ring at the top and curved flukes.",
      concepts: [
        "stability",
        "boating",
        "sailing",
        "marina",
        "harbour",
        "cruise",
        "security",
        "grounding",
      ],
      domains: ["travel", "sport", "wellbeing"],
    },
  },
  {
    icon: {
      name: "arrow-bar-to-down",
      label: "Arrow bar to down",
      tags: ["drag", "move", "bottom"],
      categories: ["arrows"],
    },
    reply: {
      description: "A downward arrow pointing at a horizontal bar.",
      concepts: [
        "download",
        "move to bottom",
        "save",
        "downloads",
        "arrow down",
      ],
      domains: ["technology"],
    },
  },
];

export function iconInput(entry: CatalogEntry): IconInput {
  return {
    name: entry.name,
    label: entry.label,
    tags: entry.tags,
    categories: entry.categories,
  };
}

/** Few-shot turns followed by the icon to label. */
export function textMessages(icon: IconInput): ChatMessage[] {
  return [
    ...FEW_SHOTS.flatMap((s): ChatMessage[] => [
      { role: "user", content: userMessage(s.icon) },
      { role: "assistant", content: JSON.stringify(s.reply) },
    ]),
    { role: "user", content: userMessage(icon) },
  ];
}
