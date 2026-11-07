---
name: web-research-scrapling
description: Fetch and extract real page content with Scrapling when researching competitors, docs, pricing or references, instead of guessing from memory.
version: 1.0.0
---

# Web research with Scrapling

Use this for any research task where the answer lives on a real page: competitor features,
pricing, documentation, changelogs, reviews, specifications. Scrapling (Python 3.10+,
already installed on this machine) fetches pages, including JavaScript-rendered ones, and
lets you extract exact text with CSS or XPath.

## Rules

1. Never state a fact about a website you have not fetched in this session. Mark anything
   you could not reach as an unknown.
2. Record the URL and the date next to every finding in `docs/research.md`.
3. Quote short, specific text (a price, a feature name, a heading). Do not paste whole pages.
4. Respect the site: no login walls, no paid content, no aggressive crawl rates. One request
   per page is normal; a loop over a whole site should pause between requests.
5. If a page blocks you, say so and move on. Do not invent the missing content.

## Fetch one page and pull text out

```python
from scrapling.fetchers import Fetcher

page = Fetcher.get('https://example.com/pricing')       # impersonates a browser by default
titles = page.css('h2::text').get_all()                  # list[str]
prices = page.xpath('//span[@class="price"]/text()').get_all()
links  = page.css('a::attr(href)').get_all()
```

`page.css(...)` and `page.xpath(...)` both return a container whose methods are:

- `.get_all()` returns a list of matches (use this, not `getall()`).
- `.get()` returns the first match or `None`.
- `.css(...)` on a match searches inside it, which is how you extract per-card fields.

## JavaScript-rendered pages

`Fetcher` does not run JavaScript. When content is rendered client-side, use the stealth
fetcher, which drives a real browser:

```python
from scrapling.fetchers import StealthyFetcher

page = StealthyFetcher.fetch('https://example.com/app', headless=True, network_idle=True)
rows = page.css('.row').get_all()
```

The browser binaries must be installed once with `scrapling install`. If that has not been
done, fall back to `Fetcher` and note in your findings that the page needed JavaScript.

## From the command line

```bash
scrapling extract get 'https://example.com/docs' out.html
scrapling extract get 'https://example.com/docs' out.txt --css-selector 'article'
```

Use `.html` or `.txt` output. **Do not ask for `.md`**: the markdown dependency is not
installed here and the command fails. If you need markdown, convert the extracted text
yourself after reading it.

## Reporting

In `docs/research.md`, group findings by question, and for each one give the claim, the exact
quote or value, the URL, and the date fetched. End with a short "could not verify" list.
A research deliverable with no URLs is not research.
