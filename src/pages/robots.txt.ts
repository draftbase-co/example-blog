import type { APIContext } from "astro";

// Built from `site` in astro.config.mjs, so a fork's robots.txt points at its own sitemap.
export function GET({ site }: APIContext) {
	return new Response(
		`User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap-index.xml", site).href}\n`,
		{ headers: { "Content-Type": "text/plain" } },
	);
}
