const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const PROMPT_TEMPLATE = (company) => `
You are CORP INTEL, an elite corporate intelligence analyst. Research "${company}" thoroughly and build a complete intelligence dossier.

Research these areas:
1. What the company does, history, headquarters, employee count
2. The CEO — name, background, tenure, notable decisions
3. Latest news (past 30-60 days) — earnings, launches, controversies, partnerships
4. Recent company actions — acquisitions, layoffs, expansions, regulatory issues
5. Financial data — revenue, market cap, stock price (if public)
6. Supply chain, trade activities, shipments or logistics information
7. Risk flags — lawsuits, controversies, regulatory scrutiny

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
      "date": "YYYY-MM or approximate",
      "headline": "News headline",
      "summary": "1-2 sentence factual summary",
      "significance": "Why this matters for the company"
    }
  ],
  "company_actions": [
    {
      "date": "YYYY-MM or approximate",
      "action": "Type (Acquisition, Partnership, Expansion, Layoff, IPO, Product Launch, etc.)",
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
  "risk_flags": [
    "Specific risk, controversy, lawsuit, or concern with brief context"
  ]
}
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generateWithRetry(model, prompt, maxRetries = 4) {
  let delay = 2000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      const msg = err.message || '';
      const isRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
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

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });

    send('status', 'Compiling intelligence report...');

    const result = await generateWithRetry(model, PROMPT_TEMPLATE(sanitizedCompany));
    const response = result.response;

    send('status', 'Processing intelligence data...');

    const rawText = response.text();

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
    send('error', `DEBUG — status:${err.status || 'none'} code:${err.code || 'none'} msg:${err.message || 'none'}`);
    res.end();
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'operational' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🔍 CORP INTEL running at http://localhost:${PORT}`);
  console.log(`   Set GEMINI_API_KEY env var to activate\n`);
});
