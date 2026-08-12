import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Static output. Posts are fetched from Draftbase during the build, so the deployed site
// is plain HTML and the API key never leaves CI.
export default defineConfig({
	// SITE_URL/BASE_PATH let a fork deploy to its own GitHub Pages URL without editing
	// this file — `npm create draftbase` sets them as repo variables.
	site: process.env.SITE_URL || "https://demo-blog.draftbase.co",
	base: process.env.BASE_PATH || "/",
	integrations: [sitemap()],
});
