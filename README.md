# ghact

A framework to act on any (new) file in a Github repository

This Docker Image exposes a server on port `4505` which:

- listens for github webhooks (`POST` requests) from the configured source repo)
- processes the changed files 

This webserver also exposes the follwing paths:

- `/status`: Serves a Badge (svg) to show the current service status
- `/workdir/jobs/`: List of runs
- `/workdir/jobs/[id]/status.json`: Status of run with that id
- `/workdir/jobs/[id]/log.txt`: Log of run with that id
- `/update?from=[from-commit-id]&till=[till-commit-id]`: send a `POST` here to
  update all files modified since from-commit-id up till-commit-id or HEAD if
  not specified
- `/full_update`: send a `POST` here to run the full_update script. Note that
  this will not delete any files (yet).

## Usage

Build as a docker container.

```sh
docker build . -t ghact
```

Requires a the environment-variable `GHTOKEN` as
`username:<personal-acces-token>` to access Github.

Then run using a volume

```sh
docker run --name ghact --env GHTOKEN=username:<personal-acces-token> -p 4505:4505 -v ghact:/app/workdir ghact
```

Exposes port `4505`.

### Docker-Compose

```yml
services:
  ghact:
    ...
    environment:
      - GHTOKEN=username:<personal-acces-token>
    volumes:
      - ghact:/app/workdir
volumes:
  ghact:
```

## Configuration

Edit the file `config/config.ts`. Should be self-explanatory what goes where.

## Development

The repo comes with vscode devcontaioner configurations. Some tweaks to allow
using git from inside the devcontainer.

To start from the terminal in vscode:

    set -a; source .env; set +a; deno run -A src/main.ts
