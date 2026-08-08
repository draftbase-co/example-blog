import { createClient, type Entry } from "@draftbase/sdk";

const apiKey = import.meta.env.DRAFTBASE_API_KEY;
if (!apiKey) {
	throw new Error(
		"DRAFTBASE_API_KEY is not set. Copy .env.example to .env and add a delivery-scoped key.",
	);
}

// Runs only in Node, at build time. Astro exposes non-PUBLIC_ env vars to server code only,
// so the key is never inlined into anything the browser downloads.
const client = createClient({
	apiKey,
	baseUrl: import.meta.env.DRAFTBASE_API_URL ?? "https://api.draftbase.co",
	environment: import.meta.env.DRAFTBASE_ENVIRONMENT ?? "production",
	cacheTtlMs: 60_000,
});

/** The API returns entry-level `tags`; the SDK's `Entry` type doesn't declare them yet. */
export type DbEntry<Fields> = Entry<Fields> & { tags: string[] };

/**
 * All published entries of one template, following cursor pagination to the end.
 * `templateId` is the template's key (e.g. "blogPost"), not a database id.
 * `include` resolves `reference` and `media` fields into nested objects — depth 1 turns
 * a post's `author` id into the author entry, depth 2 would also resolve that author's own
 * references.
 */
export async function getAll<Fields>(templateId: string, include = 1): Promise<DbEntry<Fields>[]> {
	const all: DbEntry<Fields>[] = [];
	let after: string | undefined;
	do {
		// The SDK's option is named `contentTypeId`, but the API's query param is `templateId`.
		const page = await client.getEntries<Fields>({ templateId, after, limit: 100, include });
		all.push(...(page.entries as DbEntry<Fields>[]));
		after = page.nextCursor ?? undefined;
	} while (after);
	return all;
}

/** Published posts, newest first. */
export async function getPosts(): Promise<DbEntry<Post>[]> {
	const posts = await getAll<Post>("blogPost");
	return posts.sort(
		(a, b) =>
			new Date(b.fields.publishedDate ?? b.createdAt).getTime() -
			new Date(a.fields.publishedDate ?? a.createdAt).getTime(),
	);
}

/** Prefixes a path with the configured `base`, so links work on a GitHub Pages project site. */
export function url(path = ""): string {
	return import.meta.env.BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
}

export function formatDate(value: string | undefined): string {
	if (!value) return "";
	return new Date(value).toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

export interface Media {
	url?: string | null;
	altText?: string;
}

export interface Author {
	name: string;
	slug: string;
	bio: string;
	avatar?: Media | null;
}

export interface Post {
	title: string;
	slug: string;
	excerpt: string;
	body: string;
	cover?: Media | null;
	publishedDate?: string;
	/** Resolved to the full author entry by `include: 1`. */
	author?: { _id: string; fields: Author } | null;
}
