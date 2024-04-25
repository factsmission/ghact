export type ChangeSummary = {
  added: string[];
  removed: string[];
  modified: string[];
  till: string;
};

export  default class GitRepository {
  /** @param repoUrl url of the repository */
  constructor(
    protected repoUrl: string,
    protected branch: string,
    protected token: string | undefined,
    public workDir: string,
  ) {
    Deno.mkdirSync(workDir, { recursive: true });
    console.log(`Created dir ${`${workDir}`}`)
  }

  emptyDataDir = () => {
    Deno.removeSync(this.workDir, { recursive: true });
    Deno.mkdirSync(this.workDir, { recursive: true });
  };

  cloneRepo = (log = console.log) => {
    log(`Cloning ${this.repoUrl}. This will take some time.`);
    const authUri = this.token
      ? this.repoUrl.replace(
        "https://",
        `https://${this.token}@`,
      )
      : this.repoUrl;
    const p = new Deno.Command("/usr/bin/git", {
      args: [
        "clone",
        "--single-branch",
        "--quiet",
        `--branch`,
        `${this.branch}`,
        authUri,
        `.`,
      ],
      cwd: this.workDir,
    });
    const { success, stdout, stderr } = p.outputSync();
    if (!success) {
      log("git clone failed:");
    } else {
      log("git clone succesful:");
    }
    log("STDOUT:");
    log(new TextDecoder().decode(stdout));
    log("STDERR:");
    log(new TextDecoder().decode(stderr));
    if (!success) {
      throw new Error("Abort.");
    }
  };

  // Function to update local data
  updateLocalData(
    log: (msg: string) => void = console.log,
  ) {
    log("starting git pull...");

    const p = new Deno.Command("/usr/bin/git", {
      args: ["pull"],
      env: {
        GIT_CEILING_DIRECTORIES: this.workDir,
      },
      cwd: this.workDir,
    });
    const { success, stdout, stderr } = p.outputSync();
    if (!success) {
      log("git pull failed:");
    } else {
      log("git pull successful:");
    }
    log(new TextDecoder().decode(stdout));
    log("STDERR:");
    log(new TextDecoder().decode(stderr));
    log("STDOUT:");
    if (!success) {
      this.emptyDataDir();
      this.cloneRepo(log);
    }
  }

  getModifiedAfter(
    fromCommit: string,
    tillCommit = "HEAD",
    log = console.log,
  ): ChangeSummary {
    this.updateLocalData(log);
    const p = new Deno.Command("/usr/bin/git", {
      args: [
        "diff",
        "--name-status",
        "--no-renames", // handle renames as a deletion and an addition
        fromCommit,
        tillCommit,
      ],
      cwd: this.workDir,
    });
    const { success, stdout, stderr } = p.outputSync();
    log("STDOUT:");
    log(new TextDecoder().decode(stdout));
    log("STDERR:");
    log(new TextDecoder().decode(stderr));
    if (!success) {
      throw new Error("Abort.");
    }
    if (tillCommit === "HEAD") {
      const p = new Deno.Command("/usr/bin/git", {
        args: [
          "rev-parse",
          "HEAD",
        ],
        cwd: this.workDir,
      });
      const { success, stdout } = p.outputSync();
      if (success) {
        tillCommit = new TextDecoder().decode(stdout).trim();
        log("HEAD is: " + tillCommit);
      }
    }
    const typedFiles = new TextDecoder().decode(stdout).split("\n").filter((
      s,
    ) => s.length > 0).map((s) =>
      s.split(/(\s+)/).filter((p) => p.trim().length > 0)
    );
    const weirdFiles = typedFiles.filter((t) =>
      t[0] !== "A" && t[0] !== "M" && t[0] !== "D"
    );
    if (weirdFiles.length) {
      log(
        `Unclear how to handle these files:\n - ${
          weirdFiles.map((t) => t.join).join("\n - ")
        }`,
      );
    }
    return ({
      added: typedFiles.filter((t) => t[0] === "A").map((t) => t[1]),
      modified: typedFiles.filter((t) => t[0] === "M").map((t) => t[1]),
      removed: typedFiles.filter((t) => t[0] === "D").map((t) => t[1]),
      till: tillCommit,
    });
  }
}
