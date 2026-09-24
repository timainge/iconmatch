import type { CatalogEntry } from "iconmatch";
import type { ChatMessage } from "./provider.js";

/** Bump whenever the system prompt, few-shots or user template change. */
export const PROMPT_VERSION = "text-v2";

/**
 * Spec §6.3 prompt requirements 1–4. v2 (after configs 4–5 showed v1's
 * generic concepts hurt ranking): concepts must be specific category names a
 * person would type, generic words are banned, and colours are never mentioned.
 */
export const SYSTEM_PROMPT = `You label icons so they can be found when someone searches for a category name in a personal organisation app (for example "Dog grooming", "Super contributions", "Kids' ski gear").

Each icon is a black outline drawing with no colour. You get its name, tags and category. Reply with JSON only, matching the given schema:
- "description": one literal sentence (max 160 characters) saying what the icon clearly shows, based only on its name and tags. No speculation and no colours.
- "concepts": 5 to 12 category names, lowercase, 1 to 3 words each, that a person might give a list, budget, folder or project in their own life, for which this icon would be a good, recognisable choice. Prefer specific everyday terms ("home insurance", "retirement savings", "dog walking", "tax return") and common metaphorical uses (lightbulb -> ideas, anchor -> stability). Never use generic words such as design, technology, symbol, icon, graphic, element, interface, data, information, concept, object or shape.
- "domains": 1 to 5 broad areas such as "finance", "pets", "sport", "home", "health", "work".

Interface and action glyphs (arrows, carets, toolbar symbols) get only the few everyday uses they really have; don't invent categories for them.`;

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
        "super contributions",
        "retirement savings",
        "pocket money",
        "rainy day fund",
        "kids' savings",
        "budget",
        "emergency fund",
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
        "boating",
        "sailing",
        "cruise holiday",
        "marina fees",
        "fishing trips",
        "stability",
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

/** Bump whenever the vision prompt changes (it derives from SYSTEM_PROMPT). */
export const VISION_PROMPT_VERSION = "vision-v2";

const TEXT_DESCRIPTION_RULE =
  '"description": one literal sentence (max 160 characters) saying what the icon clearly shows, based only on its name and tags. No speculation and no colours.';
if (!SYSTEM_PROMPT.includes(TEXT_DESCRIPTION_RULE)) {
  throw new Error(
    "prompts.ts: VISION_SYSTEM_PROMPT's replace target is missing from SYSTEM_PROMPT",
  );
}

/** Vision variant (spec §6.3): the description is what is visibly drawn in the image. */
export const VISION_SYSTEM_PROMPT = SYSTEM_PROMPT.replace(
  TEXT_DESCRIPTION_RULE,
  '"description": one literal sentence (max 160 characters) describing only what is visibly drawn in the attached image. No speculation and no colours.',
);

/** Few-shot turns (text) followed by the icon with its rendered image. */
export function visionMessages(
  icon: IconInput,
  pngBase64: string,
): ChatMessage[] {
  const msgs = textMessages(icon);
  const last = msgs[msgs.length - 1];
  if (last) last.images = [pngBase64];
  return msgs;
}
