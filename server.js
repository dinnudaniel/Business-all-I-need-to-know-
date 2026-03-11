const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are CORP INTEL, an elite corporate intelligence analyst with access to real-time web information. Your job is to build a comprehensive intelligence dossier on any company.

When given a company name, use your web search and fetch tools extensively to research:
1. What the company does, its history, headquarters, employee count
2. The CEO's identity, background, tenure, and any notable decisions
3. The latest news (past 30-60 days) — earnings, launches, controversies, partnerships
4. Recent company actions — acquisitions, layoffs, expansions, regulatory issues
5. Financial data — revenue, market cap, stock price (if public), growth trends
6. Supply chain, trade activities, major shipments or logistics information
7. Any risk flags — lawsuits, controversies, regulatory scrutiny, leadership changes

After thorough research, output ONLY a valid JSON object in this exact structure (no markdown, no extra text):

{
  "company_name": "Official full company name",
  "ticker": "STOCK:TICKER or null if private",
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
      "background": "2-3 sentences on their background, previous roles, and notable leadership decisions"
    },
    "key_executives": [
      {"role": "Title", "name": "Full Name"},
      {"role": "Title", "name": "Full Name"}
    ]
  },
  "latest_news": [
    {
      "date": "YYYY-MM or approximate",
      "headline": "News headline",
      "summary": "1-2 sentence factual summary",
      "significance": "Why this matters for the company"
    }
  ],
  "company_actions": [
    {
      "date": "YYYY-MM or approximate",
      "action": "Type (e.g., Acquisition, Partnership, Expansion, Layoff, IPO, Product Launch)",
      "description": "What happened and impact"
    }
  ],
  "financials": {
    "revenue": "Latest annual revenue (e.g., '$394B FY2024')",
    "market_cap": "Current market cap or 'Private'",
    "stock_price": "Current price with currency, or null if private",
    "key_metrics": [
      {"metric": "Metric name", "value": "Value"},
      {"metric": "Metric name", "value": "Value"}
    ],
    "recent_performance": "2-3 sentence summary of recent financial performance and trends"
  },
  "shipments_trade": {
    "summary": "Overview of supply chain, logistics, trade activities. If a retailer/manufacturer, describe shipment scale. If software company, describe data centers/infrastructure.",
    "notable_movements": [
      {"description": "Specific notable trade, logistics, or supply chain activity"}
    ]
  },
  "risk_flags": [
    "Specific risk, controversy, lawsuit, or concern with brief context"
  ]
}

Be thorough. Search multiple times. Verify information. Output only the JSON.`;

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

  const toolMessages = {
    web_search: 'Scanning web sources...',
    web_fetch: 'Fetching detailed intelligence...',
  };

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      tools: [
        { type: 'web_search_20260209', name: 'web_search' },
        { type: 'web_fetch_20260209', name: 'web_fetch' },
      ],
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Build a complete intelligence dossier on this company: ${sanitizedCompany}`,
        },
      ],
    });

    let accumulatedText = '';
    let searchCount = 0;

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (block.type === 'server_tool_use') {
          searchCount++;
          const toolName = block.name;
          const msg = toolMessages[toolName] || `Running ${toolName}...`;
          send('status', `[${searchCount}] ${msg}`);
        }
      }

      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          accumulatedText += event.delta.text;
          // Send periodic progress signals
          if (accumulatedText.length % 500 < 5) {
            send('progress', accumulatedText.length);
          }
        }
      }
    }

    // Try to extract JSON from the accumulated text
    const jsonMatch = accumulatedText.match(/\{[\s\S]*\}/);
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

    send('complete', parsed);
    res.end();
  } catch (err) {
    console.error('Research error:', err);
    if (err instanceof Anthropic.AuthenticationError) {
      send('error', 'API authentication failed. Please check your ANTHROPIC_API_KEY.');
    } else if (err instanceof Anthropic.RateLimitError) {
      send('error', 'Rate limit reached. Please wait a moment and try again.');
    } else {
      send('error', err.message || 'Investigation failed. Please try again.');
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
  console.log(`   Set ANTHROPIC_API_KEY env var to activate\n`);
});
