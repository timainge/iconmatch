# Eval label issues

Suspected labelling problems noticed **after** seeing results. They are listed here, not fixed, so the eval set isn't bent towards the current ranker (spec §9.1). The reviewer decides; edit `eval/queries.json` directly before creating `eval/REVIEWED`.

Source: provisional baseline run, `eval/results/2026-09-24-baseline*.json`.

| Query           | Split | Current `acceptable`                  | What the ranker returned (top 3)                      | Suggestion                                                                                                      |
| --------------- | ----- | ------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Contracts       | test  | signature, file-text, writing-sign    | **contract**, writing, writing-off                    | Add `contract` (a literal match the draft missed)                                                               |
| Board games     | dev   | dice, puzzle, chess                   | go-game, **meeple**, dice-1                           | Add `meeple`, `dice-1`…`dice-6`, maybe `go-game`                                                                |
| Important       | dev   | star, alert-circle, flag              | **label-important**, **urgent**, circle-asterisk      | Add `label-important`, `urgent`                                                                                 |
| Summer holidays | dev   | beach, sun, plane, luggage            | speedboat, **flip-flops**, plane-inflight             | Add `flip-flops`, maybe `plane-inflight`                                                                        |
| Llama trekking  | test  | (none: no-match)                      | **trekking**, mountain, mountain-off                  | Probably not a no-match: `trekking` fits "trekking". Replace the query (e.g. "Llama care") or accept `trekking` |
| Photography     | test  | camera, photo                         | macro, photo-sensor, tilt-shift                       | Consider `photo-sensor`, `macro`, `aperture`                                                                    |
| Electricity     | dev   | bolt, plug, bulb                      | solar-electricity, waves-electricity, sun-electricity | Consider the `*-electricity` icons                                                                              |
| Video games     | dev   | device-gamepad, device-gamepad-2      | brand-valorant, brand-xbox, brand-apple-arcade        | Decide whether console/game brands are acceptable for a generic label                                           |
| Donations       | dev   | heart-handshake, gift, coin           | **tip-jar**, tip-jar-pound, tip-jar-euro              | Add `tip-jar`                                                                                                   |
| Retirement      | dev   | pig-money, coin, beach, rocking-chair | **old**, moneybag-move-back, moneybag-move            | Consider `old` (an older person)                                                                                |
| Meetings        | dev   | users, calendar-event, presentation   | calendar-time, calendar-stats, brand-zoom             | Consider `calendar-time`                                                                                        |
| Internet        | dev   | wifi, world, router                   | browser, brand-bing, network                          | Consider `network`, `browser`                                                                                   |
| Personal        | dev   | user                                  | folder-user, id, id-off                               | Consider `id`, `folder-user`                                                                                    |
| Recipes         | dev   | chef-hat, tools-kitchen-2, soup       | cooker, whisk, salad                                  | Consider `cooker`, `whisk`                                                                                      |
| Stuff to sort   | dev   | box, archive, inbox, category         | sort-ascending, sort-a-z, sort-descending             | Probably fine as is (literal "sort" ≠ a box of stuff); confirm                                                  |

## Eval v2 (`eval/v2/queries.json`), noticed after the provisional run

Source: `eval/v2/results/2026-10-02-baseline*.json` (current model, provisional). Only the 30 new no-match queries are listed; v1's issues above still apply to the v1 part of v2.

| Query                             | Split | Current `acceptable` | Top result (confidence)             | Suggestion                                                                                   |
| --------------------------------- | ----- | -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Embroidery                        | dev   | (none: no-match)     | needle-thread (0.731)               | Probably not a no-match: a needle and thread fits embroidery. Accept `needle-thread` or drop |
| Quilting                          | test  | (none: no-match)     | needle-thread (0.700)               | Same as Embroidery                                                                           |
| Lacrosse                          | test  | (none: no-match)     | cricket (0.595)                     | Confirm: a cricket bat isn't a lacrosse stick, but some would accept a generic sports icon   |
| Bookbinding                       | dev   | (none: no-match)     | bookmark-edit (0.594)               | Compound word slipped the catalog filter; `book` might be acceptable                         |
| Harp lessons, Bagpipes, Accordion | dev   | (none: no-match)     | school-bell, trowel, arrows-shuffle | Confirm: would a generic `music` icon be acceptable for an instrument?                       |
| Woodturning                       | dev   | (none: no-match)     | wood (0.614)                        | Confirm: `wood` (a log) isn't a lathe, but is arguably acceptable                            |
| Septic tank                       | dev   | (none: no-match)     | tank (0.703)                        | Probably fine: Tabler `tank` is a military tank                                              |

## Eval v2, suggested by the vision judge (spec §15.6), not applied

Source: `eval/judge/results/2026-10-03.md`. qwen2.5vl:7b judged the hybrid top 5 for every v2 query from the rendered icon and the category name only. It agreed with the labels at κ 0.394. It is lenient (precision 0.40) and misses some literal icons, so treat these only as prompts for a second look.

The judge said these fit with confidence ≥ 0.95, and I (the agent) think a typical user would accept them, though the reviewed labels don't include them:

| Query           | Split | Icon (rank)                                                    |
| --------------- | ----- | -------------------------------------------------------------- |
| Moving house    | dev   | `tabler:home-move` (1)                                         |
| Tax             | dev   | `tabler:tax` (1)                                               |
| Legal           | dev   | `tabler:section-sign` (1)                                      |
| Contracts       | test  | `tabler:contract` (1), also in the v1 list above               |
| Board games     | dev   | `tabler:go-game` (1)                                           |
| Woodworking     | dev   | `tabler:chisel` (1)                                            |
| Embroidery      | dev   | `tabler:needle-thread` (1), also in the v2 list above          |
| Summer holidays | dev   | `tabler:flip-flops` (2)                                        |
| Books to read   | test  | `tabler:book-2` (2)                                            |
| Work            | test  | `tabler:briefcase-2` (2)                                       |
| Home build      | dev   | `tabler:home-2` (2)                                            |
| Phone plan      | dev   | `tabler:phone-call` (2)                                        |
| Insurance       | test  | `tabler:shield-dollar` (2)                                     |
| Passwords       | dev   | `tabler:lock-password` (2)                                     |
| Electricity     | dev   | `tabler:solar-electricity` (1), `tabler:waves-electricity` (2) |

Judge "fits" verdicts I would _not_ accept: Budget → `bell-dollar`, Cleaning → `toilet-paper`, Frog pond → `fountain`, Rent → `tax-pound`, Savings → `cloud-dollar`. The judge also rejected several literal icons the labels rightly accept (Golf → `golf`, Netflix → `brand-netflix`, GitHub stuff → `brand-github`, Knitting → `yarn`).
