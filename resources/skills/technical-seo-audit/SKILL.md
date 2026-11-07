---
name: technical-seo-audit
description: Repeatable technical SEO and answer-engine pass for a shipped site.
version: 1.0.0
---

# Technical SEO audit

Work through these in order, recording the actual result of each check:

1. **Metadata**: unique `<title>` (50-60 chars) and description (140-160) per route. Open the built HTML to confirm, do not assume a framework default.
2. **Canonicals**: one canonical per page, absolute URL.
3. **Crawl**: `robots.txt` present and correct; sitemap generated with real routes.
4. **Structured data**: JSON-LD for the business, plus Article or Product where relevant. Validate the JSON parses.
5. **Semantics**: one `h1` per page, headings in order, meaningful link text.
6. **Performance**: compress images, set width and height, defer non-critical scripts, confirm no layout shift from fonts.
7. **AEO/GEO**: factual, self-contained answer paragraphs, consistent entity naming, no invented statistics or claims.

Report each item as pass, fail, or not applicable, with the file or URL that proves it.
