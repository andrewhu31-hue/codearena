# Deploying CodeArena

The website and the backend are hosted separately because the judge runs every
submission in a Docker container, which serverless platforms don't allow.

| Part                                | Where                        | Notes                                                                                      |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| Website (`apps/web`)                | Vercel                       | Calls the API through a same-origin proxy (`/api/v1/*`), so login cookies stay first-party |
| API, judge workers, Postgres, Redis | One Linux server with Docker | `deploy/setup.sh`; Caddy provides HTTPS                                                    |

## 1. Server (API + judge)

A 2 GB Ubuntu 24.04 server is enough to start (one judge worker, concurrency 2).
As root on the server:

```bash
curl -fsSL https://raw.githubusercontent.com/andrewhu31-hue/codearena/main/deploy/setup.sh | bash -s -- main
```

It installs Docker, clones the repo to `/opt/codearena`, writes `/opt/codearena/.env`
with fresh secrets, pre-pulls the sandbox images and starts everything. The API is
served at `https://api.<server-ip-with-dashes>.sslip.io` (no domain needed); set
`API_DOMAIN` in `.env` to use your own domain instead (point an A record at the server).

Then edit `/opt/codearena/.env`:

- `CORS_ORIGIN` = the website's address from step 2 (e.g. `https://codearena.vercel.app`)
- `ANTHROPIC_API_KEY` = your key, to enable AI hints and code review (optional)

and apply with `cd /opt/codearena && docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d`.

Load the demo problems once: `docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml run --rm seed`.

## 2. Website (Vercel)

Import the repository in Vercel with **Root Directory = `apps/web`** (framework: Next.js;
`apps/web/vercel.json` sets the monorepo install/build commands) and these environment variables:

| Variable                 | Value                                                  |
| ------------------------ | ------------------------------------------------------ |
| `API_PROXY_TARGET`       | `https://<API_DOMAIN>` — REST calls are proxied here   |
| `NEXT_PUBLIC_SOCKET_URL` | `https://<API_DOMAIN>` — live updates connect directly |

Leave `NEXT_PUBLIC_API_URL` unset so the site uses the proxy.

## Updating

Re-run `setup.sh` with the branch name on the server (it pulls and rebuilds); Vercel
redeploys the website on every push to its production branch.

## Rate limits behind the proxy

`TRUST_PROXY=2` (Vercel + Caddy) lets per-IP limits see the visitor's address. Per-user
limits (submissions, AI) don't depend on it.
