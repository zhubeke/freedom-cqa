# Conversation Quality Analytics

Conversation Quality Analytics with Vue 3, Fastify, MongoDB, Redis, Redpanda, and criterion-by-criterion Cloudflare LLM evaluation.

## Prerequisites

- Docker Engine or Docker Desktop with Docker Compose
- GNU Make

No local Node.js, MongoDB, Redis, or Kafka installation is required.

## Start the complete stack

Run these commands from the repository root:

```sh
make init
make build
make up
```

Then open:

- Frontend: <http://localhost:8080>
- API through Nginx: <http://localhost:8080/api/v1/system/status>
- Backend liveness (direct): <http://localhost:3000/health/live>
- Redpanda Console: <http://localhost:8081>

`make init` copies `.env.example` to `.env` without overwriting an existing file and creates the shared `cqa_net` Docker network. The example credentials are local-development defaults; change them before deploying anywhere else.

Before running an evaluation, set `CLOUDFLARE_ACCOUNT_ID` and a newly rotated `CLOUDFLARE_API_TOKEN` in `.env`. The default Workers AI model is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`; it is configurable with `CLOUDFLARE_MODEL`. The originally selected `@cf/meta/llama-3.1-8b-instruct` was removed by Cloudflare and returns HTTP 410. Token verification alone does not verify inference access.

Run a real inference probe before queueing an evaluation:

```sh
npm --prefix backend run llm:check
```

The probe performs model inference and validates the returned JSON. It exits nonzero with a safe category for missing configuration, HTTP 401/403/404/429, provider 5xx responses, timeouts, network failures, or malformed responses. It never prints the API token.

### LLM gateway modes

`CQA_LLM_PROVIDER=workers_ai` sends `POST /client/v4/accounts/{account}/ai/v1/chat/completions` to Cloudflare and reads `choices[0].message.content`. If `CQA_LLM_PROVIDER=custom_worker`, `CQA_LLM_ENDPOINT` is required. The custom Worker receives:

```json
{ "model": "configured-model", "messages": [{ "role": "system", "content": "..." }, { "role": "user", "content": "..." }] }
```

It must return the normalized contract below. The API token is sent as a Bearer token; the Worker URL and schema are never guessed.

```json
{ "response": "{...criterion JSON...}", "model_id": "actual-model-id", "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 } }
```

## Operations

```sh
make health   # exits nonzero if any required service is missing or unhealthy
make status   # shows all containers
make logs     # follows logs; press Ctrl+C to stop
make restart  # recreates the stack in dependency order
make down     # removes containers but preserves named data volumes
make help     # lists commands
```

`make up` starts MongoDB, Redis, Redpanda, and Redpanda Console first. It waits for their real health checks before starting the API, waits for API dependency readiness, then starts Nginx and verifies the entire stack.

## API endpoints

- `GET /health/live` — process liveness
- `GET /health/ready` — dependency readiness; returns HTTP 503 if any dependency is unavailable
- `GET /api/v1/system/status` — backend, MongoDB, Redis, and Redpanda status for the UI
- `POST /api/v1/conversations/:id/evaluations` — queue one conversation evaluation
- `GET /api/v1/evaluations/:id` — evaluation progress and criterion results
- `GET /api/v1/conversations/:id/evaluations` — historical runs
- `POST /api/v1/conversations/:id/classify` — asynchronously classify one conversation
- `GET /api/v1/conversations/:id/action` — latest primary recommended action
- `GET /api/v1/actions` — action taxonomy
- `GET /api/v1/classification/labels` — proposed and verified labels
- `POST /api/v1/classification/labels/:id/verify` — verify or correct a proposed label
- `GET /api/v1/classification/status` — verified-label and TabPFN readiness
- `POST /api/v1/datasets/:groupId/classify` — asynchronously classify a dataset

## Action classification and TabPFN

Classification runs in the existing pipeline worker and makes no Cloudflare LLM calls. With `TABPFN_ENABLED=false`, or until at least two classes have three verified labels each and twelve eligible labels total, the worker transparently uses the versioned deterministic rules. Set a valid `TABPFN_API_KEY` only when you intentionally want Prior Labs fitting and prediction; only allowlisted structured features are uploaded. No transcript, conversation ID, customer identifier, or audio URL is sent.

To classify the local DEV dataset without external AI calls:

```sh
curl -X POST http://localhost:3000/api/v1/datasets/DEV/classify -H 'content-type: application/json' -d '{}'
curl http://localhost:3000/api/v1/classification/status
```

For multiple Cloudflare credentials, configure `CQA_CF_PROFILE_A_*` and `CQA_CF_PROFILE_B_*`. Profiles sharing an account and model share one request/concurrency budget. Blank profile variables keep the legacy `CLOUDFLARE_*` configuration active. Tokens must be newly rotated and are never returned by an API or logged.

## Repository layout

- `frontend/` — Vue application and Nginx image
- `backend/` — modular Fastify application and infrastructure clients
- `infra/` — configuration placeholders for later infrastructure extensions
- `docs/architecture.md` — larger-system architecture; later modules remain unimplemented
