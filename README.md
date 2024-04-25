# ghact

A framework to act on any (new) file in a Github repository

This provides a server on port `4505` which:

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

See the [example folder](example/)