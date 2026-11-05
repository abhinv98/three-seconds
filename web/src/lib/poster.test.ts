import { expect, test } from "vitest";
import { posterBytes, validPoster } from "./poster";

const GOOD = `data:image/jpeg;base64,${Buffer.from("not really a jpeg").toString("base64")}`;

test("a JPEG data URL of a sane size is kept", () => {
  expect(validPoster(GOOD)).toBe(GOOD);
  expect(posterBytes(GOOD).toString()).toBe("not really a jpeg");
});

test("anything else from the browser is dropped", () => {
  for (const bad of [null, undefined, 12, "", "https://x.test/a.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64,<script>", `data:image/jpeg;base64,${"A".repeat(400_000)}`]) {
    expect(validPoster(bad)).toBeNull();
  }
});
