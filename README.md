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
