import { type Config } from "../mod.ts";

export const config: Config = {
  title: "GhAct Example Service",
  description:
    "GhAct is a framework to execue a script on current and future files in a Github repository.",
  email: "demo@example.org",
  sourceBranch: "master",
  sourceRepository: "plazi/treatments-xml",
  sourceRepositoryUri: "https://github.com/factsmission/website.git",
  workDir: "/workdir",
};
