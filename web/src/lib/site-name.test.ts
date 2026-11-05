import { expect, test } from "vitest";
import { guessBrandName, hostOf } from "./site-name";

test("the name comes from the domain, skipping www and country parts", () => {
  expect(guessBrandName("acme.in")).toBe("Acme");
  expect(guessBrandName("https://www.meta.com")).toBe("Meta");
  expect(guessBrandName("www.acme.co.uk/shop")).toBe("Acme");
  expect(guessBrandName("shop.ray-ban.com")).toBe("Ray Ban");
});

test("an Instagram page names the brand, not Instagram", () => {
  expect(guessBrandName("instagram.com/mamaearth.in")).toBe("Mamaearth");
  expect(guessBrandName("https://www.instagram.com/nykaa/")).toBe("Nykaa");
  expect(guessBrandName("instagram.com")).toBe("");
});

test("anything that isn't an address gives nothing", () => {
  expect(guessBrandName("")).toBe("");
  expect(guessBrandName("not a site")).toBe("");
  expect(hostOf("localhost")).toBeNull();
  expect(hostOf("https://www.Meta.com/in/")).toBe("meta.com");
});
