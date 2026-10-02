# Checkpoint P4: paraphrase set review

**What to review:** `eval/choices/paraphrases.json`. It has one paraphrase for each of the 78 v2 dev queries with acceptable icons, the way a different user might name the same category (e.g. "Petrol" for "Fuel", "Bushwalking" for "Hiking", "GP visits" for "Doctor appointments"). The paraphrases were written without looking at any matcher output. Each item reuses its original's acceptable icons and is assigned, by hash, to a **tune** half (chooses `choiceSimilarity`) or a held-out **report** half. Edit any paraphrase that doesn't name the same category, then create `eval/choices/REVIEWED`. Until then the choice-learning numbers are provisional.

## Provisional results (`eval/choices/results/2026-10-03.md`, bge-small)

- **Exact repeats:** 78/78 return the remembered icon first.
- **`choiceSimilarity` chosen on dev: 0.70.** It's the best tune-half paraphrase MRR among thresholds where dev queries the memory hasn't seen lose ≤ 0.02 Hit@3/MRR. 0.65 is better for paraphrases but costs unseen queries 0.026 Hit@3; ≤ 0.60 badly hurts unseen queries (MRR 0.616 → 0.536 or worse).
- **Held-out paraphrases**, with every dev choice remembered: Hit@1 0.513 → 0.897, MRR 0.567 → 0.912.
- **Never-remembered queries (v2 test):** Hit@3 0.758 → 0.788, MRR 0.698 → 0.733, fallback recall unchanged (0.71).

## Worth a look

- **Paraphrases that might drift to a different category:** "Health" (for Medical), "Children" (Kids), "Others" (Other), "Very important" (Important), "Trips" (Travel), "Relocation" (Moving house), "Share portfolio" (Investments).
- **Australian terms**, chosen because the eval set already uses Australian categories ("Super contributions"): "Superannuation", "Bushwalking", "Petrol", "Water rates", "Private health cover", "GP visits". Swap them if your users are elsewhere.
