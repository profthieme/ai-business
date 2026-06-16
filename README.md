# AI+Business Starter

AI+Business is a lightweight AI and business strategy news/blog aggregator.

## Architecture

- **Frontend:** Vite + React static app.
- **Small backend/data job:** Node script (`scripts/fetchFeeds.js`) pulls trusted RSS feeds, filters to recent AI/business items, categorizes them, ranks them, and writes `public/data/articles.json`.
- **Scheduler:** GitHub Actions runs hourly and commits the refreshed JSON feed.
- **Bookmarks:** Stored in browser `localStorage` for this starter version.
- **Sharing:** Native share API when available, plus Gmail and Outlook compose links.

## Quick start

```bash
npm install
npm run fetch:sample
npm run dev
```

Then open the local URL printed by Vite.

## Pull live RSS feeds

```bash
npm run fetch
npm run dev
```

Some feeds may fail occasionally because publishers change RSS URLs or block automated requests. The script logs failures and continues.

## Deploy on GitHub Pages

1. Create a GitHub repo, for example `ai-business`.
2. Push this project.
3. In repository settings, enable GitHub Pages.
4. Use either GitHub Pages from a build workflow, or deploy the `dist` folder using your preferred workflow.

For a quick GitHub Pages build workflow, add a deployment workflow later or deploy through Vercel/Netlify for the simplest Vite setup.

## Where to add AI summaries

In `scripts/fetchFeeds.js`, replace the `summarize()` fallback with a call to your preferred LLM provider. Keep API keys in GitHub Actions secrets, never in frontend code.

## Next upgrade ideas

- Store bookmarks in a cloud database so they sync across devices.
- Add OpenAI/Azure OpenAI summaries and classification.
- Add story clustering for stronger Top Stories detection.
- Add source-specific RSS URLs for HBR, Lenny's Newsletter, and other sources that may require paid/private feeds.
