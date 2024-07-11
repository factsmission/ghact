import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { GitRepository } from "../src/GitRepository.ts";

Deno.test("GitRepository.getModifiedAfter", async () => {
  const repo = new GitRepository(
    "https://github.com/factsmission/ghact",
    "main",
    undefined,
    "./workdir/repo",
  );
  // these are two adjacient commits
  const commitTill = "10c5bf4"; // changes deno.lock
  const commitFrom = "8ee04e9"; // changes src/GitRepository.ts

  assertEquals(await repo.getModifiedAfter(commitTill, commitTill), {
    added: [],
    modified: ["deno.lock"],
    removed: [],
    from: "10c5bf4ede1667f4243e585636004d6594d62dab",
    till: "10c5bf4ede1667f4243e585636004d6594d62dab",
  });

  assertEquals(await repo.getModifiedAfter(commitFrom, commitTill), {
    added: [],
    modified: ["deno.lock", "src/GitRepository.ts"],
    removed: [],
    from: "8ee04e9de2e8025cfd0bf2e3e124d1e947293fe7",
    till: "10c5bf4ede1667f4243e585636004d6594d62dab",
  });
});
