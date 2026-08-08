# Draftbase example — Blog

A blog with authors, tags, pagination and an RSS feed, built with [Astro](https://astro.build)
and [Draftbase](https://draftbase.co). Posts are fetched at build time and deployed to GitHub
Pages as static HTML — no server, no runtime API calls.

Step up from [example-portfolio](https://github.com/draftbase-co/example-portfolio): this one
adds **reference fields**, **entry tags**, **pagination** and **feed generation**.

## Quickstart

```bash
npm install
cp .env.example .env      # add your API keys
npm run seed              # creates the templates + 5 sample posts in your org
npm run dev
```

## Content model

Seeded by `scripts/seed.mjs`. A template's **key** (`author`, `blogPost`) is what the delivery
API calls `templateId`.

**`author`**

| Field | Type | |
| --- | --- | --- |
| `name` | text | required |
| `slug` | text | required, used as the URL |
| `bio` | richText | |
| `avatar` | media | |

**`blogPost`**

| Field | Type | |
| --- | --- | --- |
| `title` | text | required |
| `slug` | text | required, used as the URL |
| `excerpt` | text | max 240 chars, used for meta description and cards |
| `body` | richText | required |
| `cover` | media | also used as the Open Graph image |
| `publishedDate` | date | sorts the archive, newest first |
| `author` | reference → `author` | |

**Tags** are not a field. They live on the entry itself (`entry.tags`), so any entry of any
template can carry them and `src/pages/tags/[tag].astro` builds a page per distinct tag.

## How it works

- [`src/lib/draftbase.ts`](src/lib/draftbase.ts) wraps the SDK. `getAll(templateId, include)`
  follows cursor pagination to the end of the collection.
- `include: 1` resolves `reference` and `media` fields into nested objects, so
  `post.fields.author.fields.name` works without a second request. Depth can go to 5 —
  [example-course](https://github.com/draftbase-co/example-course) uses depth 2.
- [`src/pages/[...page].astro`](src/pages/%5B...page%5D.astro) uses Astro's `paginate()` to
  emit `/`, `/2`, `/3` from one file.
- Rich text is rendered with `toHtml()` from `@draftbase/renderer` — a plain HTML string, no
  React. JSX inside the source (e.g. `<Callout>`) passes through as literal tags; to render
  real components, use `compileMDX()` inside a framework island instead.
- [`src/pages/rss.xml.ts`](src/pages/rss.xml.ts) reuses the same `toHtml()` output for
  full-content feed items.

> `react` is in `dependencies` even though this site ships no React. `@draftbase/renderer`
> exports `toHtml` and `MDXContent` from one entry point, so importing either one pulls the
> React import in at bundle time. No React reaches the browser — Astro renders this at build
> time and the output is plain HTML.

## Security — this repo is public

The delivery API key is **build-time only**:

- It is read through `import.meta.env.DRAFTBASE_API_KEY` in server code. Astro only exposes
  `PUBLIC_`-prefixed variables to the browser, so this one cannot end up in the bundle.
  **Do not rename it to `PUBLIC_DRAFTBASE_API_KEY`.**
- In CI it comes from the `DRAFTBASE_API_KEY` repository secret.
- Use a **delivery-scoped** key. It is read-only and only ever returns published entries —
  drafts are invisible to it, so an unpublished post cannot leak into a build.
- The **management** key (`DRAFTBASE_MANAGEMENT_API_KEY`) is only for `npm run seed`, and
  belongs in your local `.env` and nowhere else. It can write and delete content.
- `.env` is gitignored. Only `.env.example`, which holds no values, is committed.

Verify for yourself after a build: `grep -r "$(grep DRAFTBASE_API_KEY .env | cut -d= -f2)" dist/`
should find nothing.

## Deploying

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → add `DRAFTBASE_API_KEY` (delivery-scoped).
3. Optional: on the same page, add a repository **variable** `DRAFTBASE_ENVIRONMENT` if your
   content lives in an environment other than `production`.
4. Push to `main`.

This repo deploys to the custom domain in [`public/CNAME`](public/CNAME), so it sets no `base`.
Forking to a project site (`<user>.github.io/<repo>`)? Delete `public/CNAME` and add
`base: "/<repo>"` to [`astro.config.mjs`](astro.config.mjs).

### Rebuild when content is published

Add a Draftbase webhook pointing at:

```
POST https://api.github.com/repos/<owner>/example-blog/dispatches
{ "event_type": "draftbase-publish" }
```

with an `Authorization: Bearer <fine-grained PAT>` header, scoped to this repo with
**Contents: read and write**. That token lives in Draftbase's webhook config — never in this
repo.

## Not included

- **Comments** — needs a server or a third-party embed.
- **Search** — see [example-course](https://github.com/draftbase-co/example-course) for a
  build-time search index that works without one.
- **Draft previews** — need a running server; static builds only ever see published entries.
