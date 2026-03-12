const express = require('express');
const Groq = require('groq-sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Fetch real-time news from Google News RSS (free, no API key) ──
async function fetchRealNews(company) {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(company)}&hl=en&gl=US&ceid=US:en`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const xml = await res.text();

    // Parse RSS items with regex
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const block = match[1];
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || block.match(/<title>(.*?)<\/title>/) || [])[1] || '';
      const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
      const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
      if (title) items.push({ title: title.trim(), pubDate: pubDate.trim(), source: source.trim() });
    }
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

const PROMPT_TEMPLATE = (company, newsArticles) => {
  const newsContext = newsArticles && newsArticles.length > 0
    ? `\n\nREAL-TIME NEWS HEADLINES (from BBC, CNN, Reuters and others — use these to inform your latest_news and rumors analysis):\n${newsArticles.map((a, i) =>
        `${i + 1}. [${a.source || 'News'}] ${a.title}${a.pubDate ? ' (' + a.pubDate.slice(0, 16) + ')' : ''}`
      ).join('\n')}\n`
    : '';

  return `You are CORP INTEL, an elite corporate intelligence analyst. Research "${company}" thoroughly and build a complete intelligence dossier.${newsContext}
Research these areas:
1. What the company does, history, headquarters, employee count
2. The CEO — name, background, tenure, notable decisions
3. Latest news (past 30-60 days) — earnings, launches, controversies, partnerships. If real-time news context was provided above, use those articles as your primary source for this section.
4. Recent company actions — acquisitions, layoffs, expansions, regulatory issues
5. Financial data — revenue, market cap, stock price (if public)
6. Supply chain, trade activities, shipments or logistics information
7. Risk flags — lawsuits, controversies, regulatory scrutiny
8. Rumors — unconfirmed reports, social media speculation, industry whispers, analyst speculation, anything circulating that is NOT yet confirmed
9. Social intelligence — overall market/media/analyst sentiment and key themes being discussed

Output ONLY a valid JSON object with no markdown, no code blocks, no extra text:

{
  "company_name": "Official full company name",
  "ticker": "EXCHANGE:TICKER or null if private",
  "industry": "Primary industry/sector",
  "overview": {
    "description": "Detailed 2-3 paragraph description of what the company does, its business model, and market position",
    "founded": "Year (and founder if notable)",
    "headquarters": "City, State/Country",
    "employees": "Approximate headcount (e.g., '150,000+')",
    "website": "https://company.com"
  },
  "leadership": {
    "ceo": {
      "name": "Full name",
      "since": "Year they became CEO",
      "background": "2-3 sentences on background, previous roles, and notable decisions"
    },
    "key_executives": [
      {"role": "Title", "name": "Full Name"}
    ]
  },
  "latest_news": [
    {
      "date": "YYYY-MM-DD or YYYY-MM",
      "headline": "News headline",
      "summary": "1-2 sentence factual summary",
      "significance": "Why this matters for the company"
    }
  ],
  "company_actions": [
    {
      "date": "YYYY-MM or approximate",
      "action": "Type (Acquisition, Partnership, Expansion, Layoff, IPO, Product Launch, Regulatory Action, etc.)",
      "description": "What happened and impact"
    }
  ],
  "financials": {
    "revenue": "Latest annual revenue (e.g., '$394B FY2024')",
    "market_cap": "Current market cap or 'Private'",
    "stock_price": "Current price with currency, or null if private",
    "key_metrics": [
      {"metric": "Metric name", "value": "Value"}
    ],
    "recent_performance": "2-3 sentence summary of recent financial performance"
  },
  "shipments_trade": {
    "summary": "Overview of supply chain and trade. For retailers/manufacturers: shipment scale. For software: infrastructure/data centers.",
    "notable_movements": [
      {"description": "Notable trade, logistics, or supply chain activity"}
    ]
  },
  "rumors": [
    {
      "source": "Origin (social media chatter, industry insiders, analyst speculation, media rumors, etc.)",
      "claim": "The unconfirmed claim or rumor circulating about this company",
      "credibility": "Low / Medium / High",
      "context": "Why this rumor is circulating and what, if anything, points toward or against it"
    }
  ],
  "social_intelligence": {
    "sentiment": "Bullish / Bearish / Neutral / Mixed",
    "summary": "2-3 sentences on current analyst, media and market participant sentiment toward this company",
    "key_themes": ["theme being discussed", "another theme", "a third theme"]
  },
  "risk_flags": [
    "Specific risk, controversy, lawsuit, or concern with brief context"
  ]
}
`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithRetry(prompt, maxRetries = 4) {
  let delay = 2000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });
      return completion.choices[0].message.content;
    } catch (err) {
      const isRateLimit = err.status === 429;
      if (isRateLimit && attempt < maxRetries) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

app.post('/api/research', async (req, res) => {
  const { company } = req.body;

  if (!company || typeof company !== 'string' || company.trim().length === 0) {
    return res.status(400).json({ error: 'Company name is required' });
  }

  const sanitizedCompany = company.trim().slice(0, 200);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  try {
    send('status', 'Connecting to intelligence network...');

    // Fetch real-time news to ground the AI
    const newsArticles = await fetchRealNews(sanitizedCompany);
    if (newsArticles) {
      send('status', `Retrieved ${newsArticles.length} real-time news articles...`);
    }

    send('status', 'Compiling intelligence report...');

    const rawText = await generateWithRetry(PROMPT_TEMPLATE(sanitizedCompany, newsArticles));

    send('status', 'Processing intelligence data...');

    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      send('error', 'No intelligence data returned. Please try again.');
      res.end();
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      send('error', 'Failed to parse intelligence report. Please try again.');
      res.end();
      return;
    }

    send('progress', 100);
    send('complete', parsed);
    res.end();
  } catch (err) {
    console.error('Research error:', err.status, err.message);
    const msg = err.message || '';
    if (err.status === 429 || msg.includes('rate_limit')) {
      send('error', 'Rate limit reached. Wait a moment and try again.');
    } else if (err.status === 401 || msg.includes('invalid_api_key')) {
      send('error', 'Invalid API key. Check your GROQ_API_KEY in Render environment variables.');
    } else {
      send('error', 'Investigation failed. Please try again.');
    }
    res.end();
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'operational' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🔍 CORP INTEL running at http://localhost:${PORT}`);
  console.log(`   Set GROQ_API_KEY and GNEWS_API_KEY env vars to activate\n`);
});
