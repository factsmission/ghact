FROM denoland/deno:ubuntu-1.42.4

RUN apt update
RUN DEBIAN_FRONTEND=noninteractive apt install -y git
RUN git config --system http.postBuffer 1048576000
RUN git config --system --add safe.directory /workspaces/ghact

# The port that your application listens to.
EXPOSE 4505

WORKDIR /app

# Prefer not to run as root.
# USER deno


# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
COPY src/deps.ts src/deps.ts
RUN deno cache src/deps.ts

# These steps will be re-run upon each file change in your working directory:
ADD src src
ADD example example

CMD ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-run", "--allow-env", "example/main.ts"]
