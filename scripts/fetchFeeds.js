import fs from 'node:fs/promises';
import Parser from 'rss-parser';
import sanitizeHtml from 'sanitize-html';
import { SOURCES } from './sources.js';

const parser = new Parser({ timeout: 12000 });
const OUT = 'public/data/articles.json';
const HOURS = Number(process.env.FRESHNESS_HOURS || 48);
const USE_SAMPLE =
  process.env.USE_SAMPLE_DATA === 'true' || process.argv.includes('--sample');

const CATEGORY_KEYWORDS = {
  'AI Policy': [
    'policy',
    'regulation',
    'regulatory',
    'law',
    'copyright',
    'sovereign',
    'export control',
    'governance',
    'privacy',
    'safety'
  ],
  Marketing: [
    'marketing',
    'consumer',
    'brand',
    'retail',
    'advertising',
    'customer',
    'sales',
    'shopping',
    'commerce'
  ],
  Strategy: [
    'strategy',
    'business model',
    'enterprise',
    'firm',
    'leadership',
    'management',
    'productivity',
    'adoption',
    'workflow',
    'agent'
  ]
};

function strip(html = '') {
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {}
  })
    .replace(/\s+/g, ' ')
    .trim();
}

function classify(text) {
  const lower = text.toLowerCase();

  const scores = Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => {
    const matches = keywords.filter(keyword => lower.includes(keyword)).length;
    return [category, matches];
  });

  scores.sort((a, b) => b[1] - a[1]);

  return scores[0][1] > 0 ? scores[0][0] : 'Strategy';
}

function summarize(title, content) {
  // Free starter summary/snippet.
  // This does not call an AI API. It only uses RSS-provided text.
  const clean = strip(content);

  if (!clean) {
    return `A recent item from a trusted source about ${title}.`;
  }

  return clean.length > 260 ? `${clean.slice(0, 257)}…` : clean;
}

function scoreArticle(item, source, duplicateCount = 1) {
  const ageHours =
    (Date.now() - new Date(item.publishedAt).getTime()) / 36e5;

  const recency = Math.max(0, 48 - ageHours);
  const credibility = source.credibility * 5;
  const coverage = Math.min(20, duplicateCount * 5);

  const relevance =
    /ai|artificial intelligence|agent|llm|genai|automation/i.test(
      `${item.title} ${item.summary}`
    )
      ? 20
      : 0;

  return Math.round(recency + credibility + coverage + relevance);
}

function normalizeUrl(url = '') {
  try {
    const u = new URL(url);

    [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content'
    ].forEach(param => u.searchParams.delete(param));

    return u.toString();
  } catch {
    return url;
  }
}

function sampleArticles() {
  const now = new Date();

  return [
    {
      title:
        'Enterprise AI Agents Move From Pilot Projects to Operating Model Redesign',
      source: 'Sample Source',
      url: 'https://example.com/enterprise-ai-agents',
      publishedAt: now.toISOString(),
      summary:
        'A sample story showing how the app presents RSS-based snippets for trusted AI and business strategy content.',
      category: 'Strategy',
      isTopStory: true,
      score: 96
    },
    {
      title:
        'Retailers Test AI Shopping Assistants for Personalized Commerce',
      source: 'Sample Source',
      url: 'https://example.com/ai-shopping-assistants',
      publishedAt: new Date(now.getTime() - 3 * 36e5).toISOString(),
      summary:
        'A sample marketing-category article about AI-driven retail, customer journeys, and automated buying experiences.',
      category: 'Marketing',
      isTopStory: true,
      score: 82
    },
    {
      title:
        'New AI Governance Guidance Raises Compliance Questions for Firms',
      source: 'Sample Source',
      url: 'https://example.com/ai-governance',
      publishedAt: new Date(now.getTime() - 5 * 36e5).toISOString(),
      summary:
        'A sample AI policy article focused on regulation, governance, risk, and responsible AI practices.',
      category: 'AI Policy',
      isTopStory: true,
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
          const publishedAt = new Date(
            entry.isoDate ||
              entry.pubDate ||
              entry.published ||
              Date.now()
          ).toISOString();

          if (new Date(publishedAt).getTime() < cutoff) {
            continue;
          }

          const url = normalizeUrl(entry.link || entry.guid || '');
          const title = strip(entry.title || 'Untitled');
          const content =
            entry.contentSnippet ||
            entry.summary ||
            entry.content ||
            '';

          const summary = summarize(title, content);
          const text = `${title} ${summary}`;

          if (
            !/ai|artificial intelligence|agent|llm|genai|automation|machine learning/i.test(
              text
            )
          ) {
            continue;
          }

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

    // Deduplicate by normalized URL first; if URL is missing, use normalized title.
    const seen = new Map();

    for (const article of articles) {
      const key =
        article.url ||
        article.title
          .toLowerCase()
          .replace(/\W+/g, ' ')
          .trim();

      if (!seen.has(key)) {
        seen.set(key, article);
      }
    }

    articles = [...seen.values()];

    // Score and sort articles.
    articles = articles
      .map(article => ({
        ...article,
        score: scoreArticle(article, {
          credibility: article.sourceCredibility || 7
        })
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.publishedAt) - new Date(a.publishedAt)
      );

    // Top Stories logic:
    // - Always mark the first 10 ranked articles as Top Stories.
    // - Also mark any additional articles whose score is at least as high
    //   as the 10th-ranked article.
    // - Preserve each article's original category.
    const TOP_STORY_COUNT = 10;
    const threshold = articles[TOP_STORY_COUNT - 1]?.score ?? 85;

    articles = articles.map((article, index) => ({
      ...article,
      isTopStory: index < TOP_STORY_COUNT || article.score >= threshold
    }));
  }

  await fs.mkdir('public/data', { recursive: true });

  await fs.writeFile(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        articles
      },
      null,
      2
    )
  );

  console.log(`Wrote ${articles.length} articles to ${OUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});