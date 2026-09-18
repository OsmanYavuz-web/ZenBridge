# 🌐 ZenBridge

<p align="center">
  <b>Turn free OpenCode AI models into a universal OpenAI-compatible API gateway.</b><br>
  <i>Connect any OpenAI-compatible tool, framework, or SDK with 100% free models.</i>
</p>

<p align="center">
  <a href="README.tr.md">🇹🇷 <b>Türkçe Dokümantasyon için Buraya Tıklayın</b></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20%2B-green.svg" alt="Node.js 20+">
  <img src="https://img.shields.io/badge/TypeScript-Native-blue.svg" alt="TypeScript Native">
  <img src="https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg" alt="Zero Dependencies">
  <img src="https://img.shields.io/badge/OpenAI_API-Compatible-orange.svg" alt="OpenAI Compatible">
  <img src="https://img.shields.io/badge/Cost-100%25_Free-purple.svg" alt="100% Free">
</p>

---

## 🎯 Why Does This Project Exist?

When you run `opencode serve --port 4096`, OpenCode already launches a local HTTP REST API service offering free AI models (`cost: 0`). However, OpenCode's native API uses its own custom, session-based REST architecture (`POST /session` &rarr; `POST /session/{id}/message`) rather than the universal OpenAI `/v1/chat/completions` standard.

Virtually every AI application, IDE extension, and framework (**Cursor, Continue.dev, LibreChat, Open WebUI, LangChain, LlamaIndex, LiteLLM, Aider, Cline**) speaks exclusively the **OpenAI Chat Completions protocol**.

**ZenBridge** is a lightweight, zero-dependency bridge between these two systems:
1. It listens on standard OpenAI endpoints (`http://127.0.0.1:8080/v1`).
2. It automatically maps OpenAI requests into OpenCode's native session/message format and handles token streaming in real time.
3. It allows you to plug OpenCode's free models into any AI tool without paying a penny.

---

## ✨ Key Features

- 🚀 **Zero Dependencies:** Runs out of the box with Node 20+ native APIs (no bulky `node_modules` or `npm install` needed).
- 🔄 **Dynamic Model Auto-Discovery:** Connects to OpenCode (`GET /config/providers`) in real-time. When OpenCode adds, modifies, or updates models, ZenBridge detects them instantly with zero restarts or code changes.
- ⚡ **Full Streaming Support (SSE):** Supports Server-Sent Events (`stream: true`) for typewriter-style real-time token streaming.
- 🧠 **Smart Reasoning & Preamble Filter:** Automatically cleans internal thought chains (`<think>`, `"User wants..."`, `"Keep it concise."`) for clean and direct responses.
- 🔌 **Universal Tool Compatibility:** Drop-in replacement for any client supporting the OpenAI API standard.

---

## 📋 Dynamic Free Models & Smart Load Balancer

ZenBridge dynamically pulls all active models from your running OpenCode instance and monitors their quota/health status in real time.

* **List Active Models & Health Status:** Check live available models along with latency and quota health anytime:
  ```bash
  curl http://127.0.0.1:8080/v1/models
  ```
  Example JSON Response:
  ```json
  {
    "object": "list",
    "data": [
      {
        "id": "nemotron-3.5-lightning-free",
        "object": "model",
        "owned_by": "opencode",
        "context_window": 128000,
        "status": "healthy",
        "healthy": true,
        "latency_ms": 1420,
        "last_checked": "2026-09-18T12:25:00.000Z"
      }
    ]
  }
  ```
* **Smart Auto Load-Balancing & Failover:** When `model` is set to `"auto"` (or omitted):
  1. ZenBridge conducts background health checks every 60 seconds against upstream OpenCode models.
  2. It automatically routes incoming requests to the **healthiest model with the lowest latency**.
  3. If a free model hits quota exhaustion or rate limits (`rate_limited` / `degraded`), ZenBridge immediately isolates it and fails over to an alternative healthy model transparently.
* **Specific Models:** You can specify any model ID returned from `/v1/models` in your requests.

---

## 🚀 Quick Start (3 Steps)

### Step 1: Install OpenCode CLI (If not installed)
If you do not have the OpenCode CLI installed yet, install it via the official one-line script:
```bash
curl -fsSL https://opencode.ai/install | bash
```

---

### Step 2: Start OpenCode Bridge Server
In a terminal, launch the OpenCode API server:
```bash
opencode serve --port 4096
```
*(Keep this terminal running in the background.)*

---

### Step 3: Start ZenBridge
In a separate terminal, navigate to this project and run:
```bash
npm start
```
Or directly via the CLI:
```bash
node --experimental-strip-types bin/opencode-proxy.ts --port 8080
```

🎉 **That's it!** Your local OpenAI-compatible endpoint is live at `http://127.0.0.1:8080/v1`.

---

## 💻 Example API Requests (cURL)

#### Non-Streaming Request:
```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'
```

#### Continue an Existing Session (via session_id):
```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "session_id": "ses_abc123",
    "messages": [
      { "role": "user", "content": "Continue where we left off." }
    ]
  }'
```

#### Streaming Request (SSE):
```bash
curl -N -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [
      { "role": "user", "content": "Tell me a quick joke." }
    ],
    "stream": true
  }'
```

#### Reasoning / Chain-of-Thought & Effort Level:
```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "include_reasoning": true,
    "reasoning_effort": "high",
    "messages": [
      { "role": "user", "content": "Explain the most efficient prime-checking algorithm." }
    ]
  }'
```

#### List Available Models:
```bash
curl http://127.0.0.1:8080/v1/models
```

#### List & Manage Sessions:
```bash
# List all active sessions
curl http://127.0.0.1:8080/v1/sessions

# Get details of a session
curl http://127.0.0.1:8080/v1/sessions/ses_123abc456

# Delete a single session
curl -X DELETE http://127.0.0.1:8080/v1/sessions/ses_123abc456

# Delete ALL sessions (bulk delete)
curl -X DELETE http://127.0.0.1:8080/v1/sessions
```

---

## 🛠️ API Request Parameters & Usage Reference

When sending requests to `/v1/chat/completions`, you can configure the following body parameters:

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| **`model`** | `string` | No | `"auto"` | Target model ID (e.g., `auto`, `random`, or any specific model ID from `/v1/models`). If omitted or `"auto"`, it automatically load-balances across all active free models. |
| **`messages`** | `array` | **Yes** | - | Array of message objects representing the conversation history. See [Message Roles](#-message-roles) below. |
| **`stream`** | `boolean` | No | `false` | Enables Server-Sent Events (SSE) streaming (`text/event-stream`) for real-time typewriter output. |
| **`session_id`** | `string` | No | `""` | OpenCode session ID. Pass this to continue an existing multi-turn chat session. *(Can also be sent via `x-session-id` header)*. |
| **`include_reasoning`** | `boolean` | No | `false` | When `true`, returns the model's Chain-of-Thought thinking process in the `reasoning_content` field (OpenAI / DeepSeek format). |
| **`agent`** | `string` | No | `"build"` | OpenCode agent mode (`"build"`: full code execution/editing, `"plan"`: read-only planning mode). |
| **`directory`** | `string` | No | `undefined` | Target project working directory for OpenCode execution context (e.g. `/home/user/project`). *(Can also be sent via `x-directory` HTTP header)*. |
| **`workspace`** | `string` | No | `undefined` | Target OpenCode workspace identifier. |
| **`auto_approve`** | `boolean` | No | `false` | When `true`, automatically auto-approves all OpenCode permission requests (file writes/reads, shell commands, tools). *(Can also be sent via `x-auto-approve: true` header)*. |
| **`permission`** | `array` | No | `undefined` | Custom granular OpenCode permission rules (`[{"permission": "*", "pattern": "*", "action": "allow"}]`). |
| **`temperature`** | `number` | No | `undefined` | Sampling temperature for randomness. |
| **`max_tokens`** | `integer` | No | `undefined` | Maximum number of tokens to generate. |

---

### 🎭 Message Roles (`role`)

The `messages` array accepts standard OpenAI message structures:

* **`system`**: System instructions, persona, and behavioral guidelines. ZenBridge extracts system messages and attaches them as the top-level OpenCode system prompt.
  ```json
  { "role": "system", "content": "You are an expert TypeScript architect." }
  ```
* **`user`**: Prompts and questions sent by the human user.
  ```json
  { "role": "user", "content": "How do I optimize Node.js streams?" }
  ```
* **`assistant`**: Previous responses generated by the AI assistant. Used to provide context in multi-turn conversations when not using `session_id`.
  ```json
  { "role": "assistant", "content": "To optimize streams, you should use pipeline..." }
  ```

---

### 🧠 Reasoning & Chain-of-Thought (`include_reasoning`)

When `include_reasoning: true` is enabled, the API response populates both the standard response and the thought process:

```json
{
  "id": "chatcmpl-1726330000000",
  "object": "chat.completion",
  "model": "auto",
  "session_id": "ses_mock123",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "To check if a number is prime, test divisors up to the square root...",
        "reasoning_content": "The user is asking for prime testing. 1. Check n <= 1. 2. Check 2 and 3. 3. Step by 6..."
      },
      "finish_reason": "stop"
    }
  ]
}
```

---

### 🎛️ Controlling `temperature` & `max_tokens`

* **`temperature` (Creativity vs. Determinism):** Takes a value between `0.0` and `2.0`. It controls how deterministic or creative the model's choices are:
  * **Low Values (`0.0 - 0.2`):** The model picks highest-probability tokens. Output is strict, focused, and deterministic. Recommended for **code generation, JSON extraction, and math**.
  * **High Values (`0.7 - 1.2`):** The model introduces more variety and surprise in word choices. Recommended for **brainstorming, storytelling, and creative writing**.
* **`max_tokens` (Response Length Cap):** Defines the upper limit on generated tokens *(1 token ≈ 3-4 characters)*. The model halts generation once this threshold is reached. Useful for constraining long responses or requesting concise answers.

#### Example Request (Low Temperature & Token Limit):
```bash
curl -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "temperature": 0.1,
    "max_tokens": 500,
    "messages": [
      { "role": "user", "content": "Write a clean TypeScript debounce utility." }
    ]
  }'
```

---

## 📖 Interactive Swagger / OpenAPI Documentation

ZenBridge comes with a built-in **Swagger UI** for testing all endpoints directly in your browser:

* **Interactive Swagger UI:** [http://127.0.0.1:8080/docs](http://127.0.0.1:8080/docs) or [http://127.0.0.1:8080/swagger](http://127.0.0.1:8080/swagger)
* **OpenAPI 3.0 Specification:** [http://127.0.0.1:8080/openapi.json](http://127.0.0.1:8080/openapi.json)

You can explore request schemas, execute completions with different models, and manage sessions with zero external tooling.

---

## ⚙️ Configuration & Environment Variables

You can configure the server via `.env` or CLI flags:

| CLI Option | Environment Variable (.env) | Default | Description |
| :--- | :--- | :--- | :--- |
| `-p, --port` | `PORT` | `8080` | Port for the proxy server to listen on |
| `-h, --host` | `HOST` | `127.0.0.1` | Host address to bind to |
| `-u, --opencode-url` | `OPENCODE_BASE_URL` | `http://127.0.0.1:4096` | Upstream OpenCode server URL |
| `-k, --api-key` | `API_KEY` | `""` *(Disabled)* | Optional API key authentication |
| `--disable-public-ui` | `DISABLE_PUBLIC_UI` | `false` | Disable Web Dashboard and Swagger UI endpoints for public exposure |
| - | `DEFAULT_MODEL` | `auto` | Auto/random load-balanced selection across active free models when omitted |
| `-l, --list-models` | - | - | Live lists discovered models and exits |

---

## 🧪 Running Tests

Run the built-in native TypeScript test suite:

```bash
npm test
```

---

## ❓ Frequently Asked Questions (FAQ)

**1. "Cannot connect to OpenCode server" — what does this mean?**  
Ensure that OpenCode's local server is running in an active terminal with `opencode serve --port 4096`.

**2. What happens if OpenCode adds new models?**  
Nothing is required on your end! ZenBridge dynamically discovers all active models from OpenCode on the fly.

**3. Is an API Key mandatory?**  
No. By default, authentication is disabled. Any dummy string in your client will work.

---

## 📄 License & Responsibility
MIT License. This project is a personal, hobby-driven open-source adapter and is not intended to harm or exploit OpenCode services. All usage and responsibilities belong to the individual user.

---

## 👨‍💻 Author
* **Osman Yavuz**
* **GitHub:** [@OsmanYavuz-web](https://github.com/OsmanYavuz-web)
* **Email:** [omnyvz.yazilim@gmail.com](mailto:omnyvz.yazilim@gmail.com)


