const encoder = new TextEncoder();

export async function verifySignature(req: Request, WEBHOOK_SECRET: string) {
  const header = req.headers.get("x-hub-signature-256") ||
    req.headers.get("X-Forgejo-Signature");
  if (!header) {
    throw new Error("No x-hub-signature-256 or X-Forgejo-Signature");
  }
  const payload = JSON.stringify(req.body);
  const parts = header.split("=");
  const sigHex = parts[1];

  const algorithm = { name: "HMAC", hash: { name: "SHA-256" } };

  const keyBytes = encoder.encode(WEBHOOK_SECRET);
  const extractable = false;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    algorithm,
    extractable,
    ["sign", "verify"],
  );

  const sigBytes = hexToBytes(sigHex);
  const dataBytes = encoder.encode(payload);
  const equal = await crypto.subtle.verify(
    algorithm.name,
    key,
    sigBytes,
    dataBytes,
  );

  return equal;
}

function hexToBytes(hex: string) {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);

  let index = 0;
  for (let i = 0; i < hex.length; i += 2) {
    const c = hex.slice(i, i + 2);
    const b = parseInt(c, 16);
    bytes[index] = b;
    index += 1;
  }

  return bytes;
}
