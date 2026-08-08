import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Static output. Posts are fetched from Draftbase during the build, so the deployed site
// is plain HTML and the API key never leaves CI.
export default defineConfig({
	site: "https://demo-blog.draftbase.co",
	integrations: [sitemap()],
});
