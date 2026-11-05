import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, expect, test } from "vitest";

// The real Better Auth on a database of its own: db.ts opens its file on import.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "auth-test-"));
process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
delete process.env.TURSO_DATABASE_URL;
const { GET, POST } = await import("./route");
const { SAMPLE, SAMPLE_READ_ONLY } = await import("@/lib/sample");
const { get } = await import("@/lib/db");

const ORIGIN = "http://localhost:3000";
const post = (route: string, body: object, cookie = "") =>
  POST(
    new Request(`${ORIGIN}/api/auth${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify(body),
    }),
  );
const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

const OTHER = { name: "Asha", email: "asha@example.com", password: "asha-password" };
const MIXED_CASE = "Metty.McMetaface@META.test";
let sampleCookie: string;
let otherCookie: string;
const sessionOf = async (cookie: string) => (await GET(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }))).json();

beforeAll(async () => {
  // The email is public. Before the account exists, nobody can claim it with their own details, in any case.
  for (const attempt of [
    { ...SAMPLE, password: "another-password" },
    { ...SAMPLE, email: MIXED_CASE, password: "another-password" },
    { ...SAMPLE, name: "Not Metty" },
    { name: "Impostor", email: SAMPLE.email.toUpperCase(), password: "another-password" },
  ]) {
    expect((await post("/sign-up/email", attempt)).status).toBe(403);
  }
  for (const route of ["/sign-up/email/", "//sign-up/email", "/./sign-up/email", "/sign-up/../sign-up/email", "/sign-up/email?x=1"]) {
    expect((await post(route, { ...SAMPLE, password: "another-password" })).status).not.toBe(200);
  }
  expect(await get(`SELECT 1 FROM "user"`)).toBeNull();

  const sample = await post("/sign-up/email", { ...SAMPLE, email: MIXED_CASE });
  expect(sample.status).toBe(200);
  sampleCookie = cookieOf(sample);
  const other = await post("/sign-up/email", OTHER);
  expect(other.status).toBe(200);
  otherCookie = cookieOf(other);
});

test.each([
  ["/change-password", { currentPassword: SAMPLE.password, newPassword: "stolen-password" }],
  ["/change-email", { newEmail: "stolen@example.com" }],
  ["/update-user", { name: "Not Metty" }],
  ["/delete-user", { password: SAMPLE.password }],
  ["/revoke-sessions", {}],
  ["/revoke-other-sessions", {}],
  ["/revoke-session", { token: "x" }],
  ["/unlink-account", { providerId: "credential" }],
])("the sample's session can't call %s", async (route, body) => {
  const response = await post(route, body, sampleCookie);
  expect(response.status).toBe(403);
  expect((await response.json()).message).toBe(SAMPLE_READ_ONLY);
});

test("the sample's session can't list the other visitors' sessions", async () => {
  const response = await GET(new Request(`${ORIGIN}/api/auth/list-sessions`, { headers: { cookie: sampleCookie } }));
  expect(response.status).toBe(403);
});

test("signing up with the sample's email is refused once it exists, in any case", async () => {
  for (const email of [SAMPLE.email, SAMPLE.email.toUpperCase(), MIXED_CASE]) {
    expect((await post("/sign-up/email", { name: "Impostor", email, password: "another-password" })).status).toBe(403);
    expect((await post("/sign-up/email", { ...SAMPLE, email })).status).toBe(422);
  }
  expect((await post("/sign-in/email", { email: SAMPLE.email, password: "another-password" })).status).toBe(401);
});

test("a sign-up with no usable body is still Better Auth's bad request, not a crash", async () => {
  const send = (body: string) => POST(new Request(`${ORIGIN}/api/auth/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body }));
  for (const body of ["", "null", "[]", '"x"', "{}", '{"email":["metty.mcmetaface@meta.test"]}']) {
    const { status } = await send(body);
    expect(status, body).toBeGreaterThanOrEqual(400);
    expect(status, body).toBeLessThan(500);
  }
});

test("a mixed-case email lands on the one lowercase account, and stays locked", async () => {
  expect((await get<{ email: string }>(`SELECT email FROM "user" WHERE email LIKE 'metty%'`))?.email).toBe(SAMPLE.email);
  const signIn = await post("/sign-in/email", { email: MIXED_CASE, password: SAMPLE.password });
  expect(signIn.status).toBe(200);
  const cookie = cookieOf(signIn);
  expect((await sessionOf(cookie)).user.email).toBe(SAMPLE.email);
  expect((await post("/update-user", { name: "Not Metty" }, cookie)).status).toBe(403);
});

test.each(["/update-user/", "//update-user", "/./update-user", "/x/../update-user", "/sign-out/../update-user", "/UPDATE-USER", "/update%2Duser", "/update-user?x=/sign-out"])(
  "the sample's session can't reach update-user through %s",
  async (route) => {
    await post(route, { name: "Not Metty" }, sampleCookie);
    expect((await sessionOf(sampleCookie)).user.name).toBe(SAMPLE.name);
  },
);

test("a second sample session can't revoke the first, even with its real token", async () => {
  const second = cookieOf(await post("/sign-in/email", { email: SAMPLE.email, password: SAMPLE.password }));
  const { session } = await sessionOf(sampleCookie);
  expect((await post("/revoke-session", { token: session.token }, second)).status).toBe(403);
  expect((await sessionOf(sampleCookie)).user.email).toBe(SAMPLE.email);
});

test("with no session, nothing can reset the sample's password or send it mail", async () => {
  for (const route of ["/request-password-reset", "/forget-password", "/send-verification-email"]) {
    expect((await post(route, { email: SAMPLE.email, redirectTo: "/" })).status).toBeGreaterThanOrEqual(400);
  }
  expect((await post("/reset-password", { newPassword: "stolen-password", token: "guess" })).status).toBeGreaterThanOrEqual(400);
  expect((await post("/sign-in/email", { email: SAMPLE.email, password: "stolen-password" })).status).toBe(401);
  expect((await post("/sign-in/email", { email: SAMPLE.email, password: SAMPLE.password })).status).toBe(200);
});

test("nobody can move their account onto the sample's email", async () => {
  expect((await post("/change-email", { newEmail: SAMPLE.email }, otherCookie)).status).toBeGreaterThanOrEqual(400);
  expect((await post("/update-user", { email: SAMPLE.email }, otherCookie)).status).toBeGreaterThanOrEqual(400);
  expect((await sessionOf(otherCookie)).user.email).toBe(OTHER.email);
});

test("the sample still signs in, reads its session and signs out, with its name and password unchanged", async () => {
  const signIn = await post("/sign-in/email", { email: SAMPLE.email, password: SAMPLE.password });
  expect(signIn.status).toBe(200);
  const cookie = cookieOf(signIn);
  const session = await GET(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }));
  expect((await session.json()).user).toMatchObject({ name: SAMPLE.name, email: SAMPLE.email });

  expect((await post("/sign-out", {}, cookie)).status).toBe(200);
  const gone = await GET(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }));
  expect(await gone.json()).toBeNull();

  // Signing one visitor out leaves the others in.
  const others = await GET(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: sampleCookie } }));
  expect((await others.json()).user.email).toBe(SAMPLE.email);
});

test("no session or someone else's goes through to Better Auth as before", async () => {
  expect((await post("/update-user", { name: "Nobody" })).status).toBe(401);
  expect((await post("/update-user", { name: "Asha R" }, otherCookie)).status).toBe(200);
  const changed = await post("/change-password", { currentPassword: OTHER.password, newPassword: "new-asha-password" }, otherCookie);
  expect(changed.status).toBe(200);
  const sessions = await GET(new Request(`${ORIGIN}/api/auth/list-sessions`, { headers: { cookie: otherCookie } }));
  expect(sessions.status).toBe(200);
});
