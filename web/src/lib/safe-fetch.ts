import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// Fetches a page or image from an address we didn't choose (a brand's website, a logo URL from research):
// https only, public hosts only, a size cap and a timeout, redirects re-checked hop by hop.

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT, Tailscale included
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 127],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

function isPrivate(address: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  return blocked.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

export class FetchRefused extends Error {}

async function checkHost(url: URL) {
  if (url.protocol !== "https:") throw new FetchRefused(`Only https addresses are fetched: ${url.href}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || !host.includes(".") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FetchRefused(`Not a public host: ${host}`);
  }
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new FetchRefused(`${host} doesn't resolve.`);
  // ponytail: the check and the fetch resolve separately, so DNS rebinding could slip past; pin the address
  // with a custom undici dispatcher if this ever fetches anything more sensitive than public pages.
  if (addresses.some((a) => isPrivate(a.address))) throw new FetchRefused(`${host} points at a private address.`);
}

export interface Fetched {
  url: string;
  contentType: string;
  body: Buffer;
}

const USER_AGENT = "Mozilla/5.0 (compatible; ThreeSecondsBot/1.0; +https://three-seconds-six.vercel.app)";

export async function safeFetch(
  address: string,
  { maxBytes, timeoutMs = 8000, accept = "*/*" }: { maxBytes: number; timeoutMs?: number; accept?: string },
): Promise<Fetched> {
  let url = new URL(address);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop < 5; hop++) {
    await checkHost(url);
    const response = await fetch(url, { redirect: "manual", signal, headers: { "user-agent": USER_AGENT, accept } });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`${url.hostname} answered HTTP ${response.status}.`);
    }
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
      await response.body?.cancel();
      throw new Error(`${url.href} is larger than ${maxBytes} bytes.`);
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`${url.href} is larger than ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
    return { url: url.href, contentType: response.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new Error(`Too many redirects from ${address}.`);
}
