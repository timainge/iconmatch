import {
  createChoiceMemory,
  createIconMatcher,
  loadCatalog,
  loadKeywordIndex,
  type ChoiceEntry,
} from "@iconmatch/core";
import { packagedSource } from "@iconmatch/core/node";

// Choices your app saved earlier (e.g. from a database or localStorage).
const saved: ChoiceEntry[] = [];

const source = packagedSource();
const choices = createChoiceMemory(saved);
const matcher = await createIconMatcher({
  catalog: await loadCatalog(source),
  keywordIndex: await loadKeywordIndex(source),
  choices,
});

// The user overrides the suggestion for "Admin" with a briefcase...
await matcher.recordChoice("Admin", "tabler:briefcase");
// ...so the next "Admin" (any case or spacing) suggests it straight away.
console.log((await matcher.best("admin")).id); // tabler:briefcase

// Persist the memory however you like; it's plain JSON.
const toSave: ChoiceEntry[] = choices.export();
console.log(JSON.stringify(toSave));
