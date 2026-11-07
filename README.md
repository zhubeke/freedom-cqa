# Conversation Quality Analytics

Runnable Step 1 foundation for CQA: a Vue 3 dashboard, Fastify API, MongoDB, Redis, Redpanda, and Redpanda Console. Authentication and the ingestion/evaluation pipeline are intentionally not part of this step.

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

## Repository layout

- `frontend/` — Vue application and Nginx image
- `backend/` — modular Fastify application and infrastructure clients
- `infra/` — configuration placeholders for later infrastructure extensions
- `docs/architecture.md` — larger-system architecture; later modules remain unimplemented
