# Checkpoint P2: Lucide eval set review

**What to review:** `eval/lucide/queries.json`. It has the same 155 queries, groups and dev/test splits as the reviewed `eval/v2/queries.json`, with acceptable ids re-labelled for Lucide by browsing Lucide's catalog (names and tags). They were never taken from matcher output. When you're happy with it (edit the file directly if needed), create `eval/lucide/REVIEWED`. Until then every Lucide number is provisional.

## Provisional results (bge-small, packaged defaults, threshold 0.65)

From `eval/lucide/results/2026-10-03.md`:

| hybrid                  | Hit@3 | MRR   | fallback P | fallback R |
| ----------------------- | ----- | ----- | ---------- | ---------- |
| dev (79 + 30 fallback)  | 0.684 | 0.612 | 0.61       | 0.76       |
| test (33 + 14 fallback) | 0.788 | 0.714 | 0.56       | 0.64       |

The dev sweep's best fallback F1 is also at 0.65. Choosing Lucide's threshold is the next item once the set is reviewed. Keyword-only is weaker than Tabler's (test Hit@3 0.636), partly because Lucide has no categories.

## Labels most worth a look

1. **Brand queries (15):** Lucide has no brand icons. I labelled the closest _generic_ icons as acceptable (Netflix → `tv`/`tv-minimal-play`/`film`, Spotify → `music`/`headphones`, GitHub stuff → `git-branch`/`git-fork`/`folder-git`/`code-xml`, Slack → `messages-square`/`hash`, PayPal → `wallet`/`credit-card`, …). The alternative is to treat pure brand names as "should fall back to the letter". Your call; it moves 9 queries between Hit@k and fallback.
2. **Tabler no-match queries that have a literal Lucide icon (6):** Pottery → `amphora` (tagged pottery/vase/ceramics), Origami → `origami`, Turtle care → `turtle`, Reptile supplies → `turtle`, Soap making → `soap-dispenser-droplet`, Lapidary → `gem`.
3. **Queries that become fallback because Lucide has no icon (5):** Golf, Tennis, Yoga, Horse riding, Snowboarding.
4. **Loose judgement calls:**
   - Dentist → `toothbrush` (Lucide has no tooth)
   - Knitting → `spool` (no yarn or needles)
   - Kids → `baby`, `toy-brick`
   - Apple devices includes `apple` (the fruit, which resembles the logo)
   - Swimming lessons → `waves-ladder` only (pool ladder; plain waves left out)
   - Running → `sport-shoe`, `footprints`
5. **Kept as no-match despite loose Lucide candidates**, mirroring the reviewed v2 decisions: Quilting/Embroidery (`spool`), Puppet shows (`drama`), Falconry (`bird`), Harp lessons/Bagpipes/Accordion (generic `music`), Llama trekking (`footprints`/`mountain`).

The set is v2's no-match list plus literal Lucide matches, so the fallback queries are 43 (14 in test).
