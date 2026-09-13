# Configuration & Providers

LoomScribe can be configured via environment variables in `.env` or interactively through the in-app **Settings Modal**.

---

## 🔧 Environment Variables (`.env`)

Copy `.env.example` to `.env` in the repository root:

```ini
# Application Port (defaults to 3000)
PORT=3000

# Optional Server-Side API Keys (can also be saved via UI Settings)
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
GLM_API_KEY=
ZAI_API_KEY=
OPENROUTER_API_KEY=

# Optional Access Password (leave empty to disable login screen)
APP_PASSWORD=

# Logger Verbosity: debug | info | warn | error
LOG_LEVEL=info
```

---

## 🔌 Providers & Ecosystem

### 1. Dedicated OpenRouter Provider
OpenRouter gives access to hundreds of open-weights and commercial models through a single unified API:
* **API Key**: Set `OPENROUTER_API_KEY` in `.env` or in **Settings → OpenRouter**.
* **Model Catalog & Search**: The **Settings → OpenRouter** tab queries the live OpenRouter API with instant search and filtering across 300+ models.
* **Transparent Pricing**: Displays real-time prompt and completion pricing per million tokens (e.g. `\$0.14 / \$0.28 per 1M`).
* **Model Pinning**: Pin any OpenRouter model with a single click to add it directly to the top-bar model selector dropdown.
* **Reasoning / Thinking Effort**: Configure per-model reasoning effort (`disabled`, `minimal`, `low`, `medium`, `high`, `default`). For creative fiction where models risk drafting inside thought blocks (e.g. Qwen or Solar), setting effort to `disabled` ensures tokens are reserved for the actual story.
* **Cost Tracking**: Responses from OpenRouter track generation token usage and calculate exact per-turn generation cost in USD.

### 2. Built-in GLM Provider (Z.AI / Zhipu AI)
Direct native integration with Z.AI's state-of-the-art Chinese-English bilingual models:
* **API Key**: Set `GLM_API_KEY` or `ZAI_API_KEY` in `.env` or in **Settings → Providers**.
* **Supported Models**: `glm-4.7-flash`, `glm-4.7`, `glm-5.3-flash`, `glm-4.5-air`, etc.
* **Model Discovery**: Click **Fetch Models** to query live models via `/api/paas/v4/models`.
* **Thinking Level Control**: Select the GLM reasoning level in **Settings → Providers** (`low`, `medium`, `high`, `default`).
* **Thinking Mode Toggle**: Toggle thinking on/off via the chat header chip. When disabled, LoomScribe explicitly forwards `{ thinking: { type: 'disabled' } }` in the API payload to eliminate thinking token overhead and maximize generation speed.

### 3. Built-in OpenAI Support
* Set your API key in `.env` or in **Settings → Providers**.
* Click **Fetch Models** to automatically discover models available to your key via `/v1/models`.
* Pin custom or preview models (e.g. `gpt-5.6`, `o3-mini`, `gpt-4o`) for quick access from the top bar.
* Temperature handling: Automatically strips temperature parameters for OpenAI o-series models (`o1`, `o3`, `o4-*`) to comply with OpenAI API constraints.

### 4. Built-in DeepSeek Support
* Supports `DeepSeek V4 Pro` and `DeepSeek V4 Flash`.
* Toggle DeepSeek Reasoning / Thinking Mode directly via the quick chip in the chat header or via Settings.
* Emits reasoning tokens into a collapsible thought accordion during live streaming.

### 5. Custom OpenAI-Compatible Endpoints
Connect to any local or third-party inference backend (Ollama, LM Studio, Groq, vLLM, Together AI):
1. Open **Settings → Custom Endpoints**.
2. Fill in:
   * **Display Name**: e.g., `Local Llama 3 70B`
   * **Endpoint URL**: e.g., `http://localhost:11434/v1/chat/completions` (LoomScribe automatically normalizes URLs to ensure `/chat/completions` is present while preserving query parameters).
   * **API Key**: Optional (leave blank for local servers).
   * **Model Identifier**: e.g., `llama3:70b`
3. Custom models automatically appear in the top-bar model selector dropdown.
4. Clone existing custom endpoints with a single click to duplicate settings.

---

## 🪟 Sliding Context Window

Configure active message history in **Settings → Sliding Window**:
* **Enabled (ON)**: Retains the last *N* messages (configurable via slider, default: 16) in active history. This prevents context length overflow on extended writing sessions while keeping Slot 1 and Slot 2 intact.
* **Disabled (OFF / Full History)**: Transmits the entire conversation history with every prompt.

---

## 📊 Live Telemetry & Cost Tracking

When streaming responses, LoomScribe tracks and displays real-time inference metrics in the chat header:
* **TTFT (Time-To-First-Token)**: Latency in milliseconds from request dispatch to arrival of the first completion or reasoning token.
* **Throughput**: Generation speed measured in tokens per second (`tok/s`).
* **Token Counts**: Input prompt tokens, completion tokens, and reasoning tokens.
* **Turn Cost**: Dynamic USD calculation (e.g. `\$0.0012`) based on OpenRouter pricing or provider metadata.

---

## 🔒 Optional Authentication

Set `APP_PASSWORD` in `.env` to protect a remote or shared instance:
* Login sessions persist via secure bearer tokens stored in browser local storage.
* Leave `APP_PASSWORD` blank for instant password-free access in local development.
