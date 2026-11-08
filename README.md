Team: cook it

# Conversation Quality Analytics

Conversation Quality Analytics (CQA) imports customer conversations, evaluates them against quality criteria, and displays the results in a Vue dashboard.

## Run the project

### Prerequisites

- Docker Desktop (or Docker Engine) with Docker Compose
- GNU Make

On Windows, run the commands below from WSL or a shell that provides GNU Make and standard Unix utilities.

### 1. Create the local configuration

From the repository root:

```sh
make init
```

This creates `.env` from `.env.example` if it does not already exist and creates the shared Docker network.

To run AI evaluations, update these values in `.env`:

```dotenv
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
```

The application can start without valid Cloudflare credentials, but evaluations that use Workers AI will fail. Audio analysis also requires `HF_TOKEN` with access to the configured Pyannote model. TabPFN is optional and disabled by default.

The default language model is `@cf/meta/llama-3.1-8b-instruct-fp8-fast`. Its listed input and output rates are substantially lower than the 70B model; see [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). Existing `.env` files should set both `CLOUDFLARE_MODEL` and `CQA_CF_MODEL_ID` to this model.

For an optional DeepSeek fallback, set `CQA_DEEPSEEK_FALLBACK_ENABLED=true` and `DEEPSEEK_API_KEY` in the untracked `.env` file. Cloudflare remains primary. Provider failures (including quota, permissions, rate limits, network errors and timeouts) automatically try DeepSeek. Criterion results that still fail validation after a repair attempt also try DeepSeek, with the same scoring and evidence checks. Successful criteria are preserved. If both providers fail, the existing retry/error flow applies. Each criterion records the model that actually produced its answer.

The fallback uses `deepseek-flash` and the official [DeepSeek chat completions API](https://api-docs.deepseek.com/api/create-chat-completion/) with JSON output and thinking disabled. `DEEPSEEK_MODEL`, `CQA_DEEPSEEK_TIMEOUT_MS`, `CQA_DEEPSEEK_MAX_CONCURRENCY`, and `CQA_DEEPSEEK_REQUESTS_PER_MINUTE` can override its defaults. After changing configuration, rebuild/restart the pipeline worker. Run `npm run llm:check -- --fallback` from `backend` to verify DeepSeek independently, or `npm run llm:check` to check the primary/fallback chain. Keys are never included in committed examples or provider error messages.

To use DeepSeek first, set `CQA_LLM_PROVIDER=deepseek` with `DEEPSEEK_API_KEY`. DeepSeek becomes the primary provider and Cloudflare becomes the backup for service errors or invalid criterion results. New runs use `DEEPSEEK_MODEL` as their requested model; `CLOUDFLARE_MODEL` and the Cloudflare profiles retain their separate model settings for fallback requests.

TabPFN trains on human-verified samples stored in MongoDB's `classification_labels` collection. It requires at least 12 eligible samples across two or more action classes, with at least three samples per class. The conversation being classified is excluded from its training samples. Incomplete or outdated feature snapshots are excluded too. Until enough reviewed samples exist, recommendations use the local rules and show why TabPFN is unavailable. The app does not generate training examples to fill gaps.

### 2. Build and start

```sh
make build
make up
```

The first build can take several minutes because Docker must download and build all services.

### 3. Open the application

- Web application: <http://localhost:8080>
- API status: <http://localhost:8080/api/v1/system/status>
- Backend health: <http://localhost:3000/health/live>
- Redpanda Console: <http://localhost:8081>

To load the included sample data, open **Conversations**, select **Import conversations**, and upload `invoke.json` from the repository root.

## Useful commands

```sh
make status    # Show container status
make health    # Check that required services are healthy
make logs      # Follow logs (Ctrl+C to stop)
make restart   # Restart the complete stack
make down      # Stop containers and keep stored data
make test      # Run backend, frontend, and audio-worker checks
make help      # List all available commands
```

After changing application code or dependencies, rebuild before restarting:

```sh
make build
make restart
```

## Verify AI access

Before running an evaluation, test the configured Cloudflare model:

```sh
npm --prefix backend run llm:check
```

This requires Node.js on the host. If Node.js is not installed, start the application and check evaluation errors with `make logs` instead.

## Troubleshooting

- Run `make status` and `make health` to find missing or unhealthy services.
- Run `make logs` to inspect startup or processing errors.
- Ensure Docker Desktop is running before using any `make` command.
- If a port is already in use, change `WEB_PORT`, `BACKEND_PORT`, or the relevant service port in `.env`.
- If evaluations fail, verify the Cloudflare credentials with the AI access command above.
- If audio analysis fails, set `HF_TOKEN` and confirm access to the model configured by `CQA_AUDIO_MODEL_ID`.

`make down` preserves MongoDB, Redis, Redpanda, and model volumes, so existing local data remains available the next time the stack starts.

## Project structure

```text
frontend/                 Vue 3 frontend
backend/                  Fastify API and pipeline worker
backend/audio-worker/     Python audio-analysis worker
data/ and invoke.json     Sample input data
docs/                     Additional documentation
```
