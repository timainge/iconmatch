# Research: better icon review and generation (2026-10-03)

Two owner questions after P6/P7:

1. Do we need a better vision model for review?
2. Should generation move to cloud models, with more context engineering and a skill or harness for consistent results?

This note combines measurements made today with published work. Evidence files are in `docs/research/2026-10-03/`.

## 1. Vision review: yes, and a better local model already exists

**Measured.** Three local judges rated the same 160 (query, icon) pairs, a deterministic sample of the 775 judged in P6. Agreement is with the v3 labels (32 acceptable pairs). The judge prompt (`judge-v1`) and rendering are identical for all three.

| judge                   | κ         | accuracy  | precision (fits) | recall (fits) | s / judgement |
| ----------------------- | --------- | --------- | ---------------- | ------------- | ------------- |
| qwen2.5vl:7b (P6 judge) | 0.452     | 0.794     | 0.489            | 0.719         | ~7            |
| gemma4:12b-mlx          | 0.293     | 0.662     | 0.351            | 0.813         | ~15           |
| **qwen3-vl:8b**         | **0.569** | **0.831** | **0.549**        | **0.875**     | ~8–20         |

- **Qwen3-VL 8B is the best local judge we can run on this machine.** It agrees noticeably better with the labels (κ +0.12), and its reasons are specific ("resembles a laboratory flask, not a vase"). This matches the field: Qwen3-VL is currently the strongest open vision family on Ollama ([tinyweights](https://tinyweights.dev/posts/best-local-vision-language-models-2026/), [PromptQuorum](https://www.promptquorum.com/prompt-bites/which-ollama-models-support-vision)).
- **Speed:** it always reasons before answering (Ollama's `think: false` had no effect), so it's slower.
- **Gemma 4 12B** is more lenient and worse for this task.
- **Change made:** `iconmatch-eval --judge` now defaults to `qwen3-vl:8b`.
- **Bar:** κ 0.569 clears the §15.6 bar (0.4), so Qwen3-VL may serve as a _pre-filter_ for generated icons. Human approval stays mandatory.
- **Not measured: a cloud judge** (e.g. Claude). It would very likely agree better still. A full 775-pair run costs roughly $1–3 (≈ 1.5k input tokens per image+prompt), but it needs an API key and is a spend checkpoint.

## 2. Generation: the model is the bottleneck, not the pipeline

**Measured.** I (Claude, a frontier model) drew 12 of the 42 no-match concepts under the _same_ rules the local model got: 24×24 grid, 2px round strokes, ≤ 10 elements, whitelisted elements, no fills. See `frontier-vs-local.png`: frontier drawings are on the left, the local 7B model's on the right.

|                                           | valid (lint) | recognisable (my review)                                                                                                                            | judge "fits": qwen2.5vl / qwen3-vl |
| ----------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| qwen2.5:7b-instruct (P7 run)              | 141/168      | 0/141                                                                                                                                               | 3/141 / –                          |
| frontier model, single pass, no iteration | 12/12        | ~10/12 (bee, vase on wheel, turtle, sheep, snake in terrarium, frog, harp, origami crane, accordion, family tree; taxidermy and chimney sweep weak) | 6/12 / 8/12                        |

A frontier model produces usable icons in one pass, with no examples, critique or iteration. The local 7B model produces none. Published work agrees:

- Frontier models lead SVG generation benchmarks ([Tom Gally's benchmark via Simon Willison](https://simonwillison.net/2025/Nov/25/llm-svg-generation-benchmark/), [MindStudio comparison](https://www.mindstudio.ai/blog/gpt-54-vs-claude-opus-46-vs-gemini-31-pro-benchmarks)).
- Multimodal models beat text-only ones at spatial SVG work ([SVGenius](https://arxiv.org/html/2506.03139v1)).
- Dedicated open SVG models exist (OmniSVG, open weights; [GitHub](https://github.com/OmniSVG/OmniSVG)). They target varied, often filled styles, so they'd need fine-tuning for a 2px outline set.

**Cost of cloud generation** ([claude.com/pricing](https://claude.com/pricing), Oct 2026). Assume one draft plus two render-and-critique rounds per candidate, about 8k input and 2k output tokens.

| scope                                   | Sonnet 5.5 ($2 / $10 per MTok) | Opus 5.5 ($4 / $20 per MTok) |
| --------------------------------------- | ------------------------------ | ---------------------------- |
| one candidate                           | ~$0.04                         | ~$0.07                       |
| all 42 no-match concepts × 4 candidates | ~$6                            | ~$12                         |

## 3. Harness and context engineering for consistent results

Research on SVG generation converges on **closing the loop with rendering**: draw, render, look, critique, revise. See IntroSVG's generate–review–refine cycle ([CVPR 2026](https://arxiv.org/html/2603.09312)), Render-in-the-Loop ([arXiv](https://arxiv.org/html/2604.20730v1)) and RefineSVG ([arXiv](https://arxiv.org/html/2607.27699)), all of which report clear gains over one-shot "blind drawing". Mapped onto what iconmatch already has:

1. **Style contract (context):** a written style guide in the prompt (grid, 2px stroke, 2px padding, corner radius, optical weight, one idea per icon), plus the validator as a hard gate. _We have the validator; the guide is new._
2. **Retrieved examples (context):** pick few-shot icons that are _semantically close_ to the concept using iconmatch's own search ("Beekeeping" → bug, flower, hexagon), rather than fixed dog/home/camera. This shows the model the set's idioms for related objects. _New, cheap: the matcher already exists._
3. **Plan then draw:** ask for two or three candidate visual metaphors, pick the most recognisable at 24px, list its shapes, _then_ write SVG. _New._
4. **Render-and-critique loop:** render the draft to PNG and show it to a multimodal model (the drawer itself, if multimodal, with reference icons side by side) for critique: legible at 24px? on-style? Then revise, two or three rounds. _New; render and validate already exist._
5. **Independent judge plus human gate:** score finals with a judge from a _different_ model family than the drawer, to limit self-preference bias. Qwen3-VL locally clears the κ bar. Rank candidates and show the top ones in the review gallery for human approval. _Exists (P6/P7); swap in Qwen3-VL._
6. **Packaging:** expose it two ways:
   - a pipeline provider for the Anthropic API, for batch runs from `iconmatch-build generate`;
   - a **Claude Code skill** (`.claude/skills/draw-icon/`) with the style guide, examples and a render/validate tool, for interactive "draw an icon for X" sessions, where Claude can see its renders directly.

**Recommendation:**

- Adopt Qwen3-VL as the judge now (done).
- For generation, build steps 1–6 with a frontier model (Sonnet 5.5 for drafting, so the judge is a different model).
- Measure on the 42 no-match concepts against today's baseline (0/141 local; ~10/12 frontier single-pass).
- Proceed only with an API key and a spend cap from the owner. That's a hard checkpoint; the expected cost of the full experiment is under $15.
