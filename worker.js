// ════════════════════════════════════════════════════════════
//  Cloudflare Worker — API routes + static asset fallthrough
// ════════════════════════════════════════════════════════════

const GITHUB_OWNER = 'sbennetsa';
const GITHUB_REPO = 'dice_dungeon';
const VALID_CATEGORIES = ['bug', 'balance', 'ui-ux', 'suggestion'];
const RATE_LIMIT = 5;         // max requests
const RATE_WINDOW = 60_000;   // per 60 seconds

const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_WINDOW;
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function formatContextBlock(ctx) {
  const lines = [
    '### Game Context',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Seed | \`${ctx.seed || 'none'}\` |`,
    `| Floor | ${ctx.floor || 0} |`,
    `| Act | ${ctx.act || 0} |`,
    `| Difficulty | ${ctx.difficulty || 'unknown'} |`,
  ];
  if (ctx.enemy) lines.push(`| Enemy | ${ctx.enemy} (${ctx.enemyHp}) |`);
  lines.push(`| Player HP | ${ctx.playerHp || '?'} |`);
  lines.push(`| Level | ${ctx.level || '?'} |`);
  if (ctx.environment) lines.push(`| Environment | ${ctx.environment} |`);
  if (ctx.artifacts?.length) lines.push(`| Artifacts | ${ctx.artifacts.join(', ')} |`);
  lines.push('', `<details><summary>Browser</summary>${ctx.browser || 'unknown'}</details>`);
  return lines.join('\n');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS' && url.pathname === '/api/issue') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Issue reporting endpoint
    if (request.method === 'POST' && url.pathname === '/api/issue') {
      return handleIssueReport(request, env);
    }

    // Everything else → static assets
    return env.ASSETS.fetch(request);
  }
};

async function handleIssueReport(request, env) {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders() };

  // Rate limit by IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many reports. Please wait a minute.' }), { status: 429, headers });
  }

  // Validate token is configured
  if (!env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({ error: 'Issue reporting is not configured.' }), { status: 500, headers });
  }

  // Parse and validate payload
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400, headers });
  }

  const { title, description, category, context } = body;
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Title is required.' }), { status: 400, headers });
  }
  if (title.length > 200) {
    return new Response(JSON.stringify({ error: 'Title too long.' }), { status: 400, headers });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return new Response(JSON.stringify({ error: 'Invalid category.' }), { status: 400, headers });
  }

  // Build GitHub issue
  const categoryLabel = { bug: 'Bug', balance: 'Balance', 'ui-ux': 'UI/UX', suggestion: 'Suggestion' };
  const issueTitle = `[${categoryLabel[category]}] ${title.trim()}`;
  const issueBody = [
    description || '_No description provided._',
    '',
    '---',
    '',
    formatContextBlock(context || {}),
  ].join('\n');

  // Create issue via GitHub API
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'DiceDungeon-Worker',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: [category, 'playtester'],
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('GitHub API error:', res.status, errData);
      return new Response(JSON.stringify({ error: 'Failed to create issue.' }), { status: 502, headers });
    }

    const issue = await res.json();
    return new Response(JSON.stringify({ ok: true, issueNumber: issue.number, url: issue.html_url }), { status: 201, headers });
  } catch (err) {
    console.error('GitHub API request failed:', err);
    return new Response(JSON.stringify({ error: 'Failed to reach GitHub.' }), { status: 502, headers });
  }
}
