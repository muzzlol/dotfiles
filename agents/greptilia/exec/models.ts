#!/usr/bin/env bun
// Benchmarks for choosing a subagent's model, from Artificial Analysis (https://artificialanalysis.ai/).
//   bun models.ts <model-id...>   e.g. `bun models.ts claude-opus-5-5 gpt-6.1-sol gpt-6-luna`
// Prints CSV: one row per benchmarked effort level of each model, highest intelligence index first. An id with no
// benchmark gets one row with empty fields; an empty price or speed means the API has no measurement.
// Key: $AA_API_KEY, else its export line in ~/.secrets. Exits 1 when there is no usable data, so the caller keeps the parent's model.
const URL = "https://artificialanalysis.ai/api/v2/language/models/free";

type Model = {
  name: string;
  slug: string;
  evaluations?: { artificial_analysis_intelligence_index?: number | null };
  pricing?: { price_1m_input_tokens?: number | null; price_1m_output_tokens?: number | null };
  performance?: { median_output_tokens_per_second?: number | null };
};
type Page = { data?: Model[]; pagination?: { has_more?: boolean } };

const fail = (message: string): never => {
  console.error(`models.ts: ${message}`);
  process.exit(1);
};

const ids = process.argv.slice(2);
if (ids.length === 0)
  fail("name at least one model id, e.g. `bun models.ts claude-opus-5-5 gpt-6.1-sol`");

// Shells that skip ~/.zshrc never source ~/.secrets, so read the export line directly.
const secrets = await Bun.file(`${process.env.HOME}/.secrets`)
  .text()
  .catch(() => "");
const key = process.env.AA_API_KEY ?? secrets.match(/^export AA_API_KEY=['"]?([^'"\n]+)/m)?.[1];
if (!key) fail("no AA_API_KEY in the environment or ~/.secrets");
// The free tier pages 200 models at a time; each page counts against its rate limit.
const models: Model[] = [];
for (let page = 1; ; page++) {
  const url = `${URL}?page=${page}`;
  const response = await fetch(url, { headers: { "x-api-key": key! } }).catch((error) =>
    fail(`${url}: ${error}`),
  );
  if (!response.ok) fail(`${url} returned ${response.status}`);
  const body = (await response.json()) as Page;
  if (!Array.isArray(body.data)) fail("response has no `data` array; the API shape changed");
  models.push(...body.data!);
  if (!body.pagination?.has_more) break;
}
const intelligence = (model: Model) =>
  model.evaluations?.artificial_analysis_intelligence_index ?? null;
if (models.every((model) => intelligence(model) === null)) {
  fail("no model has `evaluations.artificial_analysis_intelligence_index`; the API shape changed");
}

// Slugs are the harness id with dots as dashes, plus an effort suffix such as `-xhigh`. A suffix starting with a
// digit is a newer version (`claude-opus-5-5` under `claude-opus-5`), not an effort level.
const slugsFor = (id: string) => {
  const base = id.toLowerCase().replaceAll(".", "-");
  return (slug: string) =>
    slug === base || (slug.startsWith(`${base}-`) && !/^\d/.test(slug.slice(base.length + 1)));
};
const matches = ids.map((id) => ({ id, rows: models.filter((model) => slugsFor(id)(model.slug)) }));

// The API reports 0 for an unmeasured price or speed.
const cell = (value: number | null | undefined, digits: number) =>
  value ? value.toFixed(digits) : "";
// Artificial Analysis blends prices 3:1 input to output.
const blended = ({ pricing }: Model) =>
  pricing?.price_1m_input_tokens && pricing.price_1m_output_tokens
    ? (3 * pricing.price_1m_input_tokens + pricing.price_1m_output_tokens) / 4
    : null;
// Names carry the effort as their first parenthesized item: `Claude Opus 5.5 (Max, Default Fallback)`.
const effort = (model: Model) => model.name.match(/\(([^,)]+)/)?.[1].toLowerCase() ?? "";
const rows = matches
  .flatMap(({ id, rows }) => rows.map((model) => ({ id, model })))
  .filter(({ model }) => intelligence(model) !== null)
  .toSorted((a, b) => intelligence(b.model)! - intelligence(a.model)!);
console.log("id,effort,intelligence,usd_per_1m_blended,tokens_per_s");
for (const { id, model } of rows) {
  const row = [
    id,
    effort(model),
    cell(intelligence(model), 1),
    cell(blended(model), 2),
    cell(model.performance?.median_output_tokens_per_second, 0),
  ];
  console.log(row.join(","));
}
for (const { id, rows } of matches) {
  if (!rows.some((model) => intelligence(model) !== null)) console.log(`${id},,,,`);
}
