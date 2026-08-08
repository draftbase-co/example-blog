import rss from "@astrojs/rss";
import { toHtml } from "@draftbase/renderer";
import type { APIContext } from "astro";
import { getPosts, url } from "../lib/draftbase";

export async function GET(context: APIContext) {
	const posts = await getPosts();
	return rss({
		title: "The Draftbase Example Blog",
		description: "A statically generated blog powered by Draftbase.",
		site: context.site!,
		items: await Promise.all(
			posts.map(async (post) => ({
				title: post.fields.title,
				description: post.fields.excerpt,
				link: url(`posts/${post.fields.slug}`),
				pubDate: new Date(post.fields.publishedDate ?? post.publishedAt ?? post.createdAt),
				categories: post.tags,
				// toHtml() renders rich text to a plain HTML string — no React, no DOM.
				content: await toHtml(post.fields.body ?? ""),
			})),
		),
	});
}
