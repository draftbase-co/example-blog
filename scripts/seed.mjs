/**
 * Creates this example's templates and a few published entries in your Draftbase org.
 *
 * Run locally only — it needs a MANAGEMENT-scoped key, which can write and delete content.
 * Never put that key in CI or in a hosting provider's environment.
 *
 *   cp .env.example .env   # add DRAFTBASE_MANAGEMENT_API_KEY
 *   npm run seed
 *
 * Safe to re-run: existing templates are left alone and entries are matched by title.
 */
const BASE_URL = process.env.DRAFTBASE_API_URL || "https://api.draftbase.co";
const API_KEY = process.env.DRAFTBASE_MANAGEMENT_API_KEY;
const ENV_ID = process.env.DRAFTBASE_ENVIRONMENT || "production";
const LOCALE = "en-US";

if (!API_KEY) {
	console.error("Set DRAFTBASE_MANAGEMENT_API_KEY in .env (see .env.example).");
	process.exit(1);
}

async function api(path, { method = "GET", body } = {}) {
	// A full seed is a burst of writes, so the API's rate limiter is expected rather than
	// exceptional — back off and retry instead of leaving the org half-seeded.
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(new URL(path, BASE_URL), {
			method,
			headers: {
				Authorization: `Bearer ${API_KEY}`,
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
		if (res.status === 429 && attempt < 5) {
			const seconds = Number(res.headers.get("retry-after")) || 2 ** attempt;
			console.log(`rate limited, retrying in ${seconds}s`);
			await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
			continue;
		}
		if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
		return res.status === 204 ? null : res.json();
	}
}

/** A template's key is derived from its name ("Blog Post" -> "blogPost"), and is what
 *  entries and the delivery API refer to as `templateId`. */
async function ensureTemplate(template) {
	const existing = await api(`/templates?envId=${ENV_ID}`);
	const match = existing.find((t) => t._id === template.key);
	if (match) {
		console.log(`template ${template.key} already exists`);
		return match._id;
	}
	const { key, ...body } = template;
	const created = await api("/templates", { method: "POST", body: { ...body, envId: ENV_ID } });
	console.log(`template ${created._id ?? key} created`);
	return created._id ?? key;
}

/** Downloads a remote image and pushes it through Draftbase's presigned-upload flow. */
async function uploadImage(url, fileName, altText) {
	const file = await fetch(url);
	if (!file.ok) throw new Error(`could not download ${url}`);
	const contentType = file.headers.get("content-type") ?? "image/jpeg";
	const blob = await file.blob();

	const upload = await api("/media/upload-url", {
		method: "POST",
		body: { fileName, contentType, envId: ENV_ID },
	});
	const form = new FormData();
	for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
	form.append("file", blob, fileName);
	const put = await fetch(upload.url, { method: "POST", body: form });
	if (!put.ok) throw new Error(`storage upload failed: ${put.status} ${await put.text()}`);

	const { id } = await api("/media/confirm", {
		method: "POST",
		body: { storageKey: upload.storageKey, contentType, envId: ENV_ID, altText },
	});
	return id;
}

async function ensureEntry(templateId, titleField, fields, tags = []) {
	const list = await api(`/entries?envId=${ENV_ID}&templateId=${templateId}&limit=100`);
	const match = list.items.find((e) => e.fields[titleField] === fields[titleField]);
	if (match) {
		// Re-publish rather than skip: a previous run interrupted between create and publish
		// leaves a draft the site cannot see.
		if (match.status !== "published") {
			await api(`/entries/${match._id}/status`, {
				method: "PATCH",
				body: { status: "published" },
			});
		}
		console.log(`entry "${fields[titleField]}" already exists`);
		return match._id;
	}
	const { id } = await api("/entries", {
		method: "POST",
		body: { templateId, locale: LOCALE, envId: ENV_ID, fields, tags },
	});
	await api(`/entries/${id}/status`, { method: "PATCH", body: { status: "published" } });
	console.log(`entry "${fields[titleField]}" created and published`);
	return id;
}

const templates = [
	{
		key: "author",
		name: "Author",
		titleField: "name",
		fields: [
			{ key: "name", label: "Name", type: "text", required: true },
			{ key: "slug", label: "Slug", type: "text", required: true, isSlug: true },
			{ key: "bio", label: "Bio", type: "richText" },
			{ key: "avatar", label: "Avatar", type: "media" },
		],
	},
	{
		key: "blogPost",
		name: "Blog Post",
		titleField: "title",
		fields: [
			{ key: "title", label: "Title", type: "text", required: true },
			{ key: "slug", label: "Slug", type: "text", required: true, isSlug: true },
			{ key: "excerpt", label: "Excerpt", type: "text", multiline: true, maxLength: 240 },
			{ key: "body", label: "Body", type: "richText", required: true },
			{ key: "cover", label: "Cover image", type: "media" },
			{ key: "publishedDate", label: "Published date", type: "date" },
			// A reference points at another template by key. `include: 1` on the delivery
			// call swaps the stored id for the full author entry.
			{
				key: "author",
				label: "Author",
				type: "reference",
				referenceTemplateId: "author",
			},
		],
	},
	{
		// Rendered on the home page and emitted as FAQPage JSON-LD, so the answers an
		// assistant quotes are edited in the CMS rather than hardcoded in the template.
		key: "faq",
		name: "Faq",
		titleField: "question",
		fields: [
			{ key: "question", label: "Question", type: "text", required: true },
			{ key: "answer", label: "Answer", type: "text", multiline: true, required: true },
			{ key: "order", label: "Order", type: "number" },
		],
	},
];

const faqs = [
	{
		question: "How often do you publish?",
		answer: "A new post goes up every other week, give or take.",
		order: 1,
	},
	{
		question: "Is there an RSS feed?",
		answer: "Yes. The feed is at /rss.xml and is linked from the header and the footer.",
		order: 2,
	},
	{
		question: "Can I contribute a guest post?",
		answer: "Occasionally. Send a short pitch and a writing sample first.",
		order: 3,
	},
	{
		question: "How is this site built?",
		answer: "Astro renders it to static HTML at build time, pulling posts from a headless CMS's delivery API. There is no server and no client-side data fetching.",
		order: 4,
	},
];

const authors = [
	{
		name: "Dana Okafor",
		slug: "dana-okafor",
		image: "https://picsum.photos/seed/dana/400/400",
		bio: "Writes about the unglamorous parts of shipping software. Ten years in, still deleting code.",
	},
	{
		name: "Marco Lind",
		slug: "marco-lind",
		image: "https://picsum.photos/seed/marco/400/400",
		bio: "Infrastructure engineer. Believes most outages are configuration wearing a costume.",
	},
];

const posts = [
	{
		title: "The static site is back, and it never really left",
		slug: "static-sites-are-back",
		author: "dana-okafor",
		tags: ["architecture", "performance"],
		publishedDate: "2026-01-14",
		image: "https://picsum.photos/seed/static/1200/675",
		excerpt:
			"Rendering pages at build time is not a nostalgia trip. It is the cheapest way to serve content that changes a few times a day.",
		body: `Every few years the industry rediscovers that most pages do not change between
requests. A marketing site, a documentation set, a blog: the content shifts when someone
publishes, not when someone visits.

## What you actually pay for

A server-rendered page costs you compute on every request, plus the operational surface
that comes with it — scaling rules, cold starts, a database that has to stay up. A static
page costs you one build.

## Where it stops working

Static rendering falls over the moment content has to be personalised per visitor, or the
catalogue is large enough that a full rebuild takes longer than the publishing cadence.
Both are real limits. Neither applies to a blog.

## The practical setup

Content lives in a CMS. A webhook fires on publish. CI rebuilds and pushes HTML to a CDN.
The whole loop takes a minute or two, and nothing is running in between.`,
	},
	{
		title: "Your CMS should not know what your website looks like",
		slug: "cms-should-not-know-your-layout",
		author: "dana-okafor",
		tags: ["cms", "architecture"],
		publishedDate: "2026-02-02",
		image: "https://picsum.photos/seed/cms/1200/675",
		excerpt:
			"Page builders are a trap. Model the content, then decide separately how it renders.",
		body: `The fastest way to make content unusable is to store it as a layout.

## Symptoms

You know you have this problem when moving a post to a new design means opening every
entry, or when the answer to "can we put this on the mobile app too?" is no.

## Model the shape, not the page

A blog post has a title, a body, an author and a date. That is true whether it renders as
a web page, an RSS item, a newsletter, or a card in an app. The two-column layout with the
pull quote on the right is a rendering decision, and it belongs in the code that renders.

## The test

Ask whether you could rebuild the front end from scratch, in a different framework,
without touching a single entry. If the answer is no, the layout has leaked into the
content.`,
	},
	{
		title: "Build-time secrets are still secrets",
		slug: "build-time-secrets",
		author: "marco-lind",
		tags: ["security", "ci"],
		publishedDate: "2026-02-20",
		image: "https://picsum.photos/seed/secrets/1200/675",
		excerpt:
			"A static site has no server to leak from, which makes it easy to forget the build had credentials.",
		body: `Static output is reassuring: there is no runtime, so there is nothing to
compromise at runtime. The build is a different story.

## The three ways it goes wrong

1. The key gets a public prefix. Every framework has one — \`PUBLIC_\`, \`NEXT_PUBLIC_\`,
   \`VITE_\` — and it means "inline this into the browser bundle". Renaming a variable is
   enough to publish a credential.
2. The key gets committed. Usually in a \`.env\` that was never added to \`.gitignore\`.
3. The key is over-scoped. A read-only delivery key that leaks is an inconvenience. A
   management key that leaks is an incident.

## What to do about it

Use the narrowest scope that can build the site. Keep write-capable keys off CI entirely —
if seeding needs one, run it from a laptop. And grep your build output for the key before
you trust the setup, because that check takes five seconds and assumptions do not.`,
	},
	{
		title: "Pagination is a content decision",
		slug: "pagination-is-a-content-decision",
		author: "marco-lind",
		tags: ["architecture"],
		publishedDate: "2026-03-09",
		image: "https://picsum.photos/seed/pagination/1200/675",
		excerpt:
			"Cursor or offset is an implementation detail. How many items belong on a page is not.",
		body: `Most pagination arguments are about mechanics — cursors versus offsets, stable
sorts, the total count query nobody needs. Those matter, but they are downstream of a
question the engineering team usually skips: what is a page for?

## Cursors, briefly

Offset pagination re-scans rows it has already skipped and shifts under you when something
is inserted. Cursor pagination hands you an opaque marker and continues from there. For an
API that feeds a build, cursors are the right default — you are walking the whole set once,
in order.

## The part that is not mechanical

Five posts per page is a reading decision. So is whether the archive is paginated at all,
or is one long list that a browser's find-in-page can search. Ask what a reader is doing on
that screen before picking a number.`,
	},
	{
		title: "Write the boring version first",
		slug: "write-the-boring-version-first",
		author: "dana-okafor",
		tags: ["process"],
		publishedDate: "2026-03-28",
		image: "https://picsum.photos/seed/boring/1200/675",
		excerpt: "The abstraction you skip today is the one you would have got wrong anyway.",
		body: `Nobody has ever been paged because a function was too obvious.

## Two implementations, then a pattern

The rule that survives contact with real codebases: write it inline the first time, write
it inline again the second time, and extract on the third — when you can finally see which
parts actually vary.

## The cost nobody counts

An abstraction built on one example encodes one example's assumptions. The second caller
bends to fit. The third adds a flag. Now the shared helper has three modes and every change
to it is a change to everything.

## What lazy actually means

Not fewer features. Fewer moving parts per feature — which is the only kind of simplicity
that is still there in a year.`,
	},
];

async function main() {
	for (const template of templates) await ensureTemplate(template);
	// The CLI (`npm create draftbase`) seeds schema only, so a new project starts empty.
	if (process.env.SEED_TEMPLATES_ONLY) return;

	const authorIds = {};
	for (const { image, ...author } of authors) {
		const avatar = await uploadImage(image, `${author.slug}.jpg`, `Photo of ${author.name}`);
		authorIds[author.slug] = await ensureEntry("author", "name", { ...author, avatar });
	}

	for (const { image, author, tags, ...post } of posts) {
		const cover = await uploadImage(image, `${post.slug}.jpg`, `Cover image for ${post.title}`);
		await ensureEntry("blogPost", "title", { ...post, cover, author: authorIds[author] }, tags);
	}

	for (const faq of faqs) await ensureEntry("faq", "question", faq);

	console.log("\nSeed complete. Run `npm run dev`.");
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
