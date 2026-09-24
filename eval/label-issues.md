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
