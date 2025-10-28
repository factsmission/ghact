import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyBasicAuth } from "../src/helpers.ts";

Deno.test("verifyBasicAuth - correct credentials", () => {
  const password = "test-password";
  const authHeader = "Basic " + btoa("admin:test-password");
  const request = new Request("http://example.com", {
    headers: { "Authorization": authHeader },
  });

  assertEquals(verifyBasicAuth(request, password), true);
});

Deno.test("verifyBasicAuth - incorrect username", () => {
  const password = "test-password";
  const authHeader = "Basic " + btoa("wronguser:test-password");
  const request = new Request("http://example.com", {
    headers: { "Authorization": authHeader },
  });

  assertEquals(verifyBasicAuth(request, password), false);
});

Deno.test("verifyBasicAuth - incorrect password", () => {
  const password = "test-password";
  const authHeader = "Basic " + btoa("admin:wrong-password");
  const request = new Request("http://example.com", {
    headers: { "Authorization": authHeader },
  });

  assertEquals(verifyBasicAuth(request, password), false);
});

Deno.test("verifyBasicAuth - missing Authorization header", () => {
  const password = "test-password";
  const request = new Request("http://example.com");

  assertEquals(verifyBasicAuth(request, password), false);
});

Deno.test("verifyBasicAuth - invalid Authorization header format", () => {
  const password = "test-password";
  const request = new Request("http://example.com", {
    headers: { "Authorization": "Bearer some-token" },
  });

  assertEquals(verifyBasicAuth(request, password), false);
});

Deno.test("verifyBasicAuth - malformed base64 credentials", () => {
  const password = "test-password";
  const request = new Request("http://example.com", {
    headers: { "Authorization": "Basic invalid-base64" },
  });

  assertEquals(verifyBasicAuth(request, password), false);
});
