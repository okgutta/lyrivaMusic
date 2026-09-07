import { normalizeApiBaseUrl } from "./url.ts";

let failures = 0;
function check(input: string, expected: string | null): void {
  const actual = normalizeApiBaseUrl(input);
  if (actual === expected) return;
  failures += 1;
  console.error("FAIL: normalizeApiBaseUrl", { input, expected, actual });
}

check("https://api.example.com/v1/", "https://api.example.com/v1");
check("http://localhost:8080/v1", "http://localhost:8080/v1");
check("http://127.0.0.1/v1", "http://127.0.0.1/v1");
check("http://[::1]:8080/v1", "http://[::1]:8080/v1");
check("http://api.example.com/v1", null);
check("javascript:alert(1)", null);
check("https://user:pass@api.example.com/v1", null);
check("https://api.example.com/v1?key=secret", null);

if (failures > 0) throw new Error(`${failures} URL tests failed`);
console.log("URL tests passed");
