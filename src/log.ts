import {
  mergeReadableStreams,
  TextLineStream,
  toTransformStream,
} from "./deps.ts";

const colors = {
  OK: "#26a269",
  Failed: "#c01c28",
  Unknown: "#5e5c64",
};

export const createBadge = (
  status: "OK" | "Failed" | "Unknown",
  workDir: string,
  name: string,
) => {
  const svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="280" height="36" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg">
  <path style="fill:#5e5c64" d="M 137.99998,36 H 7.999996 C 3.568002,36 0,32.431994 0,28 V 8 C 0,3.568002 3.568002,0 7.999996,0 V 0 H 137.99998" />
  <path style="fill:${
    colors[status]
  }" d="m 137.99998,0 h 133.99998 c 4.43199,0 7.99997,3.568002 7.99997,8 v 20 c 0,4.431994 -3.56798,8 -7.99997,8 H 137.99998" />
  <text style="font-size:28px;font-family:sans-serif;fill:#ffffff;stroke-width:8" x="8" y="28">${name}</text>
  <text style="font-size:28px;font-family:sans-serif;fill:#ffffff;stroke-width:8" x="146" y="28">${status}</text>
</svg>`;
  return Deno.writeTextFileSync(`${workDir}/status.svg`, svg);
};

/**
 * Combines two `ReadableStream<Uint8Array>`s into one, interleaving them
 * line-by-line and prefixing them with `OUT> ` and `ERR> ` respectively.
 *
 * @example Usage with `LogFn`
 * ```ts
 * import { combineCommandOutputs, type LogFn } from "."
 * const log: LogFn = // ... ;
 * const command = new Deno.Command("bash", {
 *   args: ["-c", 'echo "This is stdout"; echo "This is stderr" >&2'],
 *   stdin: "null",
 *   stderr: "piped",
 *   stdout: "piped",
 * });
 * const child = command.spawn();
 * await log(combineCommandOutputs(child.stdout, child.stderr));
 * const { success } = await child.status;
 * ```
 */
export function combineCommandOutputs(
  stdout: ReadableStream<Uint8Array>,
  stderr: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  return mergeReadableStreams(
    markCommandOutput(stdout, "OUT>"),
    markCommandOutput(stderr, "ERR>"),
  ).pipeThrough(new TextEncoderStream());
}

export const commandOutputToLines = (
  stream: ReadableStream<Uint8Array>,
): ReadableStream<string> => {
  return stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());
};

const markCommandOutput = (
  stream: ReadableStream<Uint8Array>,
  marker: string,
): ReadableStream<string> => {
  return commandOutputToLines(stream)
    .pipeThrough(toTransformStream(async function* (src) {
      for await (const chunk of src) {
        yield `${marker} ${chunk}`;
      }
      yield "\n";
    }));
};
