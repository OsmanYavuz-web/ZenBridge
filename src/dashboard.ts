/**
 * ZenBridge Landing Dashboard HTML Generator
 */

export interface DashboardData {
  service: string;
  version: string;
  status: string;
  opencodeUrl: string;
  opencodeConnected: boolean;
  availableModelsCount: number;
  defaultModel: string;
  port: number;
  host: string;
  uptimeSeconds: number;
  models: Array<{ id: string; name: string; provider: string; context_window?: number }>;
}

export function getDashboardHtml(data: DashboardData): string {
  const baseUrl = `http://${data.host === '0.0.0.0' ? '127.0.0.1' : data.host}:${data.port}`;
  const openAiBaseUrl = `${baseUrl}/v1`;

  const statusBadge = data.opencodeConnected
    ? `<span class="badge-status online"><span class="dot pulse"></span> OpenCode Connected (4096)</span>`
    : `<span class="badge-status offline"><span class="dot"></span> OpenCode Disconnected</span>`;

  const modelCards = data.models
    .map(
      (m) => `
      <div class="model-card" onclick="copyText('${m.id}', this)">
        <div class="model-header">
          <span class="model-name">${m.name || m.id}</span>
          <span class="model-provider">${m.provider}</span>
        </div>
        <div class="model-id-row">
          <code>${m.id}</code>
          <button class="copy-btn" title="Copy Model ID">📋</button>
        </div>
        <div class="model-footer">
          <span>Context: ${(m.context_window || 64000).toLocaleString()} tokens</span>
          <span class="free-tag">Free ($0)</span>
        </div>
      </div>
    `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZenBridge - Universal AI Gateway</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #0a0d12;
      --bg-surface: #11151c;
      --bg-card: #161b24;
      --bg-card-hover: #1e2430;
      --border-subtle: #232936;
      --border-glow: #384252;
      --text-main: #f0f3f6;
      --text-muted: #8b949e;
      --text-accent: #58a6ff;
      --accent-gradient: linear-gradient(135deg, #38ef7d 0%, #11998e 100%);
      --blue-gradient: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      --glow-color: rgba(59, 130, 246, 0.15);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Background glow effect */
    .bg-glow {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 800px;
      height: 350px;
      background: radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, rgba(139, 92, 246, 0.05) 50%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem 1.5rem;
      position: relative;
      z-index: 1;
      width: 100%;
    }

    /* Header Navbar */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--border-subtle);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .logo-icon {
      font-size: 1.6rem;
    }

    .logo-tag {
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      background: rgba(88, 166, 255, 0.15);
      color: var(--text-accent);
      border: 1px solid rgba(88, 166, 255, 0.3);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .btn-swagger {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: var(--blue-gradient);
      color: #fff;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      transition: all 0.2s ease;
      box-shadow: 0 4px 14px rgba(59, 130, 246, 0.35);
    }

    .btn-swagger:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
    }

    /* Hero Section */
    .hero {
      text-align: center;
      padding: 3rem 0 2.5rem 0;
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.9rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      border-radius: 9999px;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 1.25rem;
    }

    .hero h1 {
      font-size: 2.8rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.2;
      margin-bottom: 1rem;
      background: linear-gradient(180deg, #ffffff 0%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero p {
      font-size: 1.15rem;
      color: var(--text-muted);
      max-width: 680px;
      margin: 0 auto 2rem auto;
      line-height: 1.6;
    }

    /* Endpoint Quick Copy Card */
    .quick-endpoint-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-glow);
      border-radius: 12px;
      padding: 1.25rem;
      max-width: 640px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }

    .endpoint-label {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.05em;
    }

    .endpoint-val {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-accent);
      font-size: 1.05rem;
      font-weight: 600;
    }

    .copy-button {
      background: #232936;
      color: #fff;
      border: 1px solid #384252;
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s;
    }

    .copy-button:hover {
      background: #2f3747;
      border-color: #58a6ff;
    }

    /* Status Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin: 3rem 0;
    }

    .stat-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .stat-label {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .stat-value {
      font-size: 1.4rem;
      font-weight: 700;
      color: #fff;
    }

    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      width: fit-content;
    }

    .badge-status.online {
      background: rgba(35, 134, 54, 0.15);
      color: #3fb950;
      border: 1px solid rgba(63, 185, 80, 0.3);
    }

    .badge-status.offline {
      background: rgba(218, 54, 51, 0.15);
      color: #f85149;
      border: 1px solid rgba(248, 81, 73, 0.3);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }

    .dot.pulse {
      box-shadow: 0 0 0 0 rgba(63, 185, 80, 0.7);
      animation: pulse 1.6s infinite;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(63, 185, 80, 0.7); }
      70% { box-shadow: 0 0 0 8px rgba(63, 185, 80, 0); }
      100% { box-shadow: 0 0 0 0 rgba(63, 185, 80, 0); }
    }

    /* Section Headers */
    .section-title {
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .section-title a {
      font-size: 0.85rem;
      color: var(--text-accent);
      text-decoration: none;
      font-weight: 500;
    }

    /* Models Grid */
    .models-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1rem;
      margin-bottom: 3.5rem;
    }

    .model-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 1.1rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .model-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-glow);
      transform: translateY(-2px);
    }

    .model-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .model-name {
      font-weight: 600;
      font-size: 1rem;
      color: #fff;
    }

    .model-provider {
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.08);
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      color: var(--text-muted);
    }

    .model-id-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.3);
      padding: 0.4rem 0.6rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }

    .model-id-row code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      color: #93c5fd;
    }

    .copy-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.85rem;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .copy-btn:hover {
      opacity: 1;
    }

    .model-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.75rem;
      color: var(--text-muted);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 0.5rem;
    }

    .free-tag {
      color: #4ade80;
      font-weight: 600;
    }

    /* Integration Tabs */
    .integrations-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      overflow: hidden;
    }

    .tab-headers {
      display: flex;
      background: #0e1218;
      border-bottom: 1px solid var(--border-subtle);
    }

    .tab-btn {
      background: none;
      border: none;
      padding: 1rem 1.5rem;
      color: var(--text-muted);
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    .tab-btn:hover {
      color: #fff;
    }

    .tab-btn.active {
      color: var(--text-accent);
      border-bottom-color: var(--text-accent);
      background: var(--bg-surface);
    }

    .tab-content {
      padding: 1.5rem;
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    pre {
      background: #090c10;
      border: 1px solid var(--border-subtle);
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      line-height: 1.5;
      color: #e6edf3;
    }

    /* Footer */
    footer {
      margin-top: auto;
      text-align: center;
      padding: 2rem;
      color: var(--text-muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--border-subtle);
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: #238636;
      color: #fff;
      padding: 0.75rem 1.25rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s ease;
      pointer-events: none;
      z-index: 999;
    }

    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
  </style>
</head>
<body>
  <div class="bg-glow"></div>

  <div class="container">
    <header>
      <div class="logo">
        <span class="logo-icon">🌐</span>
        <span>ZenBridge</span>
        <span class="logo-tag">v${data.version}</span>
      </div>
      <div class="nav-actions">
        <a href="/v1" class="btn-swagger">
          <span>📖</span>
          <span>Open Swagger UI</span>
        </a>
      </div>
    </header>

    <section class="hero">
      <div class="hero-badge">
        <span>⚡ OpenAI-Compatible API Gateway &middot; Free OpenCode Models</span>
      </div>
      <h1>Universal OpenAI Gateway<br>for OpenCode Models</h1>
      <p>Connect any OpenAI-compatible tool or SDK with free OpenCode models.</p>

      <div class="quick-endpoint-box">
        <div style="text-align: left;">
          <div class="endpoint-label">OpenAI Base URL</div>
          <div class="endpoint-val">${openAiBaseUrl}</div>
        </div>
        <button class="copy-button" onclick="copyText('${openAiBaseUrl}', this)">
          <span>📋</span>
          <span>Copy URL</span>
        </button>
      </div>
    </section>

    <!-- Stats Row -->
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Upstream OpenCode Bridge</span>
        <div style="margin-top: 0.3rem;">${statusBadge}</div>
      </div>
      <div class="stat-card">
        <span class="stat-label">Available Free Models</span>
        <span class="stat-value">${data.availableModelsCount}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Default Fallback Model</span>
        <span class="stat-value" style="font-size: 1.1rem; color: #93c5fd;">${data.defaultModel}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Server Uptime</span>
        <span class="stat-value" style="font-size: 1.1rem;">${Math.floor(data.uptimeSeconds / 60)}m ${data.uptimeSeconds % 60}s</span>
      </div>
    </div>

    <!-- Available Models Grid -->
    <div class="section-title">
      <span>🤖 Available Free Models (${data.availableModelsCount})</span>
      <a href="/v1/models" target="_blank">View /v1/models JSON &rarr;</a>
    </div>

    <div class="models-grid">
      ${modelCards}
    </div>

    <!-- Quick Integration Guides -->
    <div class="section-title">
      <span>🚀 Quick Client Integration</span>
      <a href="/docs" target="_blank">Explore API in Swagger &rarr;</a>
    </div>

    <div class="integrations-card">
      <div class="tab-headers">
        <button class="tab-btn active" onclick="switchTab('tab-cursor', this)">Cursor & Windsurf</button>
        <button class="tab-btn" onclick="switchTab('tab-continue', this)">Continue.dev</button>
        <button class="tab-btn" onclick="switchTab('tab-python', this)">Python SDK</button>
        <button class="tab-btn" onclick="switchTab('tab-curl', this)">cURL</button>
      </div>

      <div id="tab-cursor" class="tab-content active">
        <p style="color: var(--text-muted); margin-bottom: 0.75rem; font-size: 0.9rem;">
          Go to <b>Settings &rarr; Models &rarr; OpenAI API Key</b> and set:
        </p>
        <pre><code>Base URL: ${openAiBaseUrl}
API Key:  opencode (or any dummy text)
Model:    auto (or any model from /v1/models)</code></pre>
      </div>

      <div id="tab-continue" class="tab-content">
        <p style="color: var(--text-muted); margin-bottom: 0.75rem; font-size: 0.9rem;">
          Add to your <code>~/.continue/config.json</code>:
        </p>
        <pre><code>{
  "models": [
    {
      "title": "OpenCode Auto Free",
      "provider": "openai",
      "model": "auto",
      "apiBase": "${openAiBaseUrl}",
      "apiKey": "opencode"
    }
  ]
}</code></pre>
      </div>

      <div id="tab-python" class="tab-content">
        <pre><code>from openai import OpenAI

client = OpenAI(
    base_url="${openAiBaseUrl}",
    api_key="opencode"
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Explain async/await in 2 sentences."}]
)
print(response.choices[0].message.content)</code></pre>
      </div>

      <div id="tab-curl" class="tab-content">
        <pre><code>curl -X POST ${openAiBaseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'</code></pre>
      </div>
    </div>
  </div>

  <footer>
    ZenBridge &middot; Open-source universal OpenAI gateway for OpenCode models.
  </footer>

  <div id="toast" class="toast">Copied to clipboard!</div>

  <script>
    function copyText(text, elem) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied: ' + text);
      }).catch(() => {
        showToast('Copied to clipboard');
      });
    }

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    }

    function switchTab(tabId, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
    }
  </script>
</body>
</html>`;
}
