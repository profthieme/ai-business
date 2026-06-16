import fs from 'node:fs/promises';
import Parser from 'rss-parser';
import sanitizeHtml from 'sanitize-html';
import { SOURCES } from './sources.js';

const parser = new Parser({ timeout: 12000 });
const OUT = 'public/data/articles.json';
const HOURS = Number(process.env.FRESHNESS_HOURS || 48);
const USE_SAMPLE = process.env.USE_SAMPLE_DATA === 'true' || process.argv.includes('--sample');

const CATEGORY_KEYWORDS = {
  'AI Policy': ['policy', 'regulation', 'regulatory', 'law', 'copyright', 'sovereign', 'export control', 'governance', 'privacy', 'safety'],
  'Marketing': ['marketing', 'consumer', 'brand', 'retail', 'advertising', 'customer', 'sales', 'shopping', 'commerce'],
  'Strategy': ['strategy', 'business model', 'enterprise', 'firm', 'leadership', 'management', 'productivity', 'adoption', 'workflow', 'agent']
};

function strip(html = '') {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim();
}

function classify(text) {
  const lower = text.toLowerCase();
  const scores = Object.entries(CATEGORY_KEYWORDS).map(([cat, kws]) => [cat, kws.filter(k => lower.includes(k)).length]);
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] > 0 ? scores[0][0] : 'Strategy';
}

function summarize(title, content) {
  // Starter fallback summary. Replace this with an LLM call in production.
  const clean = strip(content);
  if (!clean) return `A recent item from a trusted source about ${title}.`;
  return clean.length > 260 ? `${clean.slice(0, 257)}…` : clean;
}

function scoreArticle(item, source, duplicateCount = 1) {
  const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 36e5;
  const recency = Math.max(0, 48 - ageHours);
  const credibility = source.credibility * 5;
  const coverage = Math.min(20, duplicateCount * 5);
  const relevance = /ai|artificial intelligence|agent|llm|genai|automation/i.test(`${item.title} ${item.summary}`) ? 20 : 0;
  return Math.round(recency + credibility + coverage + relevance);
}

function normalizeUrl(url = '') {
  try {
    const u = new URL(url);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(p => u.searchParams.delete(p));
    return u.toString();
  } catch { return url; }
}

function sampleArticles() {
  const now = new Date();
  return [
    {
      title: 'Enterprise AI Agents Move From Pilot Projects to Operating Model Redesign',
      source: 'Sample Source',
      url: 'https://example.com/enterprise-ai-agents',
      publishedAt: now.toISOString(),
      summary: 'A sample story showing how the app presents AI-generated summaries for trusted AI and business strategy content.',
      category: 'Top Stories',
      isTopStory: true,
      score: 96
    },
    {
      title: 'Retailers Test AI Shopping Assistants for Personalized Commerce',
      source: 'Sample Source',
      url: 'https://example.com/ai-shopping-assistants',
      publishedAt: new Date(now.getTime() - 3 * 36e5).toISOString(),
      summary: 'A sample marketing-category article about AI-driven retail, customer journeys, and automated buying experiences.',
      category: 'Marketing',
      isTopStory: false,
      score: 82
    },
    {
      title: 'New AI Governance Guidance Raises Compliance Questions for Firms',
      source: 'Sample Source',
      url: 'https://example.com/ai-governance',
      publishedAt: new Date(now.getTime() - 5 * 36e5).toISOString(),
      summary: 'A sample AI policy article focused on regulation, governance, risk, and responsible AI practices.',
      category: 'AI Policy',
      isTopStory: false,
      score: 79
    }
  ];
}

async function main() {
  let articles = [];

  if (USE_SAMPLE) {
    articles = sampleArticles();
  } else {
    const cutoff = Date.now() - HOURS * 36e5;

    for (const source of SOURCES) {
      try {
        const feed = await parser.parseURL(source.url);
        for (const entry of feed.items || []) {
          const publishedAt = new Date(entry.isoDate || entry.pubDate || entry.published || Date.now()).toISOString();
          if (new Date(publishedAt).getTime() < cutoff) continue;

          const url = normalizeUrl(entry.link || entry.guid || '');
          const title = strip(entry.title || 'Untitled');
          const content = entry.contentSnippet || entry.summary || entry.content || '';
          const summary = summarize(title, content);
          const text = `${title} ${summary}`;
          if (!/ai|artificial intelligence|agent|llm|genai|automation|machine learning/i.test(text)) continue;

          articles.push({
            title,
            source: source.name,
            url,
            publishedAt,
            summary,
            category: classify(text),
            isTopStory: false,
            sourceCredibility: source.credibility
          });
        }
      } catch (err) {
        console.warn(`Failed to fetch ${source.name}: ${err.message}`);
      }
    }

    // Deduplicate by normalized URL/title.
    const seen = new Map();
    for (const a of articles) {
      const key = a.url || a.title.toLowerCase().replace(/\W+/g, ' ').trim();
      if (!seen.has(key)) seen.set(key, a);
    }
    articles = [...seen.values()];

    articles = articles.map(a => ({ ...a, score: scoreArticle(a, { credibility: a.sourceCredibility || 7 }, 1) }))
      .sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));

    const threshold = articles[4]?.score ?? 85;
    articles = articles.map((a, i) => ({
      ...a,
      isTopStory: i < 5 || a.score >= threshold,
      category: i < 5 ? 'Top Stories' : a.category
    }));
  }

  await fs.mkdir('public/data', { recursive: true });
  await fs.writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), articles }, null, 2));
  console.log(`Wrote ${articles.length} articles to ${OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
