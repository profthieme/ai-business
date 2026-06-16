import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const CATEGORIES = ['Top Stories', 'Strategy', 'Marketing', 'AI Policy'];

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

function useBookmarks() {
  const [bookmarks, setBookmarks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aiBusinessBookmarks') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('aiBusinessBookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  const toggle = (article) => {
    setBookmarks(prev => prev.some(a => a.url === article.url)
      ? prev.filter(a => a.url !== article.url)
      : [{ ...article, savedAt: new Date().toISOString() }, ...prev]);
  };

  return { bookmarks, toggle, isBookmarked: (url) => bookmarks.some(a => a.url === url) };
}

function shareLinks(article) {
  const subject = encodeURIComponent(`AI+Business: ${article.title}`);
  const body = encodeURIComponent(`${article.title}\n\n${article.summary}\n\n${article.url}`);
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`,
    outlook: `https://outlook.office.com/mail/deeplink/compose?subject=${subject}&body=${body}`,
    mailto: `mailto:?subject=${subject}&body=${body}`
  };
}

function ArticleCard({ article, bookmarked, onBookmark }) {
  const links = shareLinks(article);

  async function nativeShare() {
    if (navigator.share) {
      await navigator.share({ title: article.title, text: article.summary, url: article.url });
    } else {
      await navigator.clipboard.writeText(article.url);
      alert('Link copied to clipboard.');
    }
  }

  return (
    <article className="card">
      <div className="meta">
        <span>{article.source}</span>
        <span>•</span>
        <span>{timeAgo(article.publishedAt)}</span>
        <span className="category">{article.category}</span>
      </div>
      <h2><a href={article.url} target="_blank" rel="noreferrer">{article.title}</a></h2>
      <p>{article.summary}</p>
      <div className="score">Relevance score: {article.score}</div>
      <div className="actions">
        <button onClick={() => onBookmark(article)}>{bookmarked ? 'Saved ✓' : 'Save'}</button>
        <button onClick={nativeShare}>Share / Text</button>
        <a href={links.gmail} target="_blank" rel="noreferrer">Gmail</a>
        <a href={links.outlook} target="_blank" rel="noreferrer">Outlook</a>
      </div>
    </article>
  );
}

function App() {
  const [articles, setArticles] = useState([]);
  const [activeCategory, setActiveCategory] = useState('Top Stories');
  const [showSaved, setShowSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const { bookmarks, toggle, isBookmarked } = useBookmarks();

  async function loadFeed(cacheBust = false) {
    setLoading(true);
    try {
      const url = ${import.meta.env.BASE_URL}data/articles.json${cacheBust ? ?t=${Date.now()} : ''};
      const res = await fetch(url);
      const data = await res.json();
      setArticles(data.articles || []);
      setUpdatedAt(data.generatedAt || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFeed(); }, []);

  const visible = useMemo(() => {
    const feed = showSaved ? bookmarks : articles;
    if (showSaved) return feed;
    if (activeCategory === 'Top Stories') return feed.filter(a => a.category === 'Top Stories' || a.isTopStory);
    return feed.filter(a => a.category === activeCategory);
  }, [articles, bookmarks, activeCategory, showSaved]);

  return (
    <main>
      <header className="hero">
        <div>
          <h1>AI+Business</h1>
          <p>Recent, trusted AI strategy news and analysis. Freshness target: 48 hours.</p>
          {updatedAt && <small>Last updated: {new Date(updatedAt).toLocaleString()}</small>}
        </div>
        <button className="refresh" onClick={() => loadFeed(true)}>Refresh</button>
      </header>

      <nav className="tabs">
        {CATEGORIES.map(cat => (
          <button key={cat} className={!showSaved && activeCategory === cat ? 'active' : ''} onClick={() => { setShowSaved(false); setActiveCategory(cat); }}>
            {cat}
          </button>
        ))}
        <button className={showSaved ? 'active' : ''} onClick={() => setShowSaved(true)}>Saved ({bookmarks.length})</button>
      </nav>

      {loading && <p className="empty">Loading feed…</p>}
      {!loading && visible.length === 0 && <p className="empty">No stories found for this view. Try Refresh or run <code>npm run fetch</code>.</p>}

      <section className="feed">
        {visible.map(article => (
          <ArticleCard
            key={article.url}
            article={article}
            bookmarked={isBookmarked(article.url)}
            onBookmark={toggle}
          />
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
