import { afterEach, describe, expect, it } from "vitest";
import { MAX_DRAWINGS_PER_USER } from "./routes/drawings";
import { startTestServer, TestClient, TestServer } from "./testServer";
import { LIMITS } from "./validation";

const running: TestServer[] = [];
async function start(): Promise<TestServer> {
  const server = await startTestServer();
  running.push(server);
  return server;
}
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()));
});

const document = (extra: object = {}) => ({
  formatVersion: 1,
  units: "mm",
  layers: [],
  entities: [{ id: "c1", kind: "circle" }],
  dimensions: [],
  ...extra,
});
const newDrawing = (over: object = {}) => ({ title: "Bracket", document: document(), paramsText: "width = 10\n", ...over });

async function signedIn(server: TestServer, email: string): Promise<TestClient> {
  const client = server.client();
  await client.login(email);
  return client;
}

describe("drawings API", () => {
  it("requires sign-in for everything except reading a public drawing", async () => {
    const server = await start();
    const anon = server.client();
    expect((await anon.get("/api/drawings")).status).toBe(401);
    expect((await anon.post("/api/drawings", newDrawing())).status).toBe(401);
    expect((await anon.put("/api/drawings/00000000-0000-4000-8000-000000000000", { title: "x" })).status).toBe(401);
    expect((await anon.delete("/api/drawings/00000000-0000-4000-8000-000000000000")).status).toBe(401);
  });

  it("creates, lists, reads, updates and deletes a drawing", async () => {
    const server = await start();
    const ann = await signedIn(server, "ann@example.com");

    const created = await ann.post("/api/drawings", newDrawing());
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ title: "Bracket", visibility: "private", paramsText: "width = 10\n" });
    const id: string = created.json.id;

    expect((await ann.get("/api/drawings")).json.drawings).toEqual([
      expect.objectContaining({ id, title: "Bracket", visibility: "private" }),
    ]);
    // The list is a summary: no heavy document payload.
    expect((await ann.get("/api/drawings")).json.drawings[0]).not.toHaveProperty("document");

    const read = await ann.get(`/api/drawings/${id}`);
    expect(read.json).toMatchObject({ id, isOwner: true, document: document() });

    const updated = await ann.put(`/api/drawings/${id}`, { title: "Renamed", paramsText: "width = 20\n" });
    expect(updated.json).toMatchObject({ title: "Renamed", paramsText: "width = 20\n", document: document() }); // untouched fields survive

    expect((await ann.delete(`/api/drawings/${id}`)).json).toEqual({ ok: true });
    expect((await ann.get(`/api/drawings/${id}`)).status).toBe(404);
  });

  it("keeps private drawings private, and public ones readable by anyone but writable only by the owner", async () => {
    const server = await start();
    const ann = await signedIn(server, "ann@example.com");
    const bob = await signedIn(server, "bob@example.com");
    const anon = server.client();
    const { id } = (await ann.post("/api/drawings", newDrawing())).json;

    // Private
    expect((await anon.get(`/api/drawings/${id}`)).status).toBe(403);
    expect((await bob.get(`/api/drawings/${id}`)).status).toBe(403);
    expect((await bob.get("/api/drawings")).json.drawings).toEqual([]); // not even listed

    // Public
    expect((await ann.put(`/api/drawings/${id}`, { visibility: "public" })).json.visibility).toBe("public");
    const asAnon = await anon.get(`/api/drawings/${id}`);
    expect(asAnon.status).toBe(200);
    expect(asAnon.json).toMatchObject({ title: "Bracket", isOwner: false });
    expect((await bob.get(`/api/drawings/${id}`)).json.isOwner).toBe(false);

    // ...but still only the owner can change or delete it
    expect((await bob.put(`/api/drawings/${id}`, { title: "hijacked" })).status).toBe(403);
    expect((await bob.delete(`/api/drawings/${id}`)).status).toBe(403);
    expect((await ann.get(`/api/drawings/${id}`)).json.title).toBe("Bracket");

    // And it can go private again
    await ann.put(`/api/drawings/${id}`, { visibility: "private" });
    expect((await anon.get(`/api/drawings/${id}`)).status).toBe(403);
  });

  it("answers 404 for ids that are malformed or don't exist", async () => {
    const server = await start();
    const ann = await signedIn(server, "ann@example.com");
    expect((await ann.get("/api/drawings/not-a-uuid")).status).toBe(404);
    expect((await ann.get("/api/drawings/00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await ann.get("/api/drawings/1' OR '1'='1")).status).toBe(404);
  });

  describe("validation", () => {
    it.each([
      ["a missing title", { title: undefined }, /title must be a string/],
      ["an empty title", { title: "   " }, /must not be empty/],
      ["an over-long title", { title: "x".repeat(LIMITS.titleMaxLength + 1) }, /at most/],
      ["a non-string title", { title: 42 }, /title must be a string/],
      ["a missing document", { document: undefined }, /document must be an object/],
      ["an array as document", { document: [] }, /document must be an object/],
      ["a document without entities", { document: { dimensions: [] } }, /entities must be an array/],
      ["a document without dimensions", { document: { entities: [] } }, /dimensions must be an array/],
      ["non-string paramsText", { paramsText: 5 }, /paramsText must be a string/],
      ["oversized paramsText", { paramsText: "x".repeat(LIMITS.paramsTextMaxLength + 1) }, /at most/],
      ["an unknown visibility", { visibility: "friends" }, /visibility must be/],
    ])("rejects %s on create", async (_name, override, message) => {
      const server = await start();
      const ann = await signedIn(server, "ann@example.com");
      const res = await ann.post("/api/drawings", { ...newDrawing(), ...override });
      expect(res.status).toBe(400);
      expect(res.json.error).toMatch(message);
    });

    it("rejects an empty or invalid update", async () => {
      const server = await start();
      const ann = await signedIn(server, "ann@example.com");
      const { id } = (await ann.post("/api/drawings", newDrawing())).json;
      expect((await ann.put(`/api/drawings/${id}`, {})).json.error).toBe("nothing to update");
      expect((await ann.put(`/api/drawings/${id}`, { visibility: "nope" })).status).toBe(400);
      expect((await ann.put(`/api/drawings/${id}`, [1, 2])).status).toBe(400);
    });

    it("trims titles", async () => {
      const server = await start();
      const ann = await signedIn(server, "ann@example.com");
      expect((await ann.post("/api/drawings", newDrawing({ title: "  Bracket  " }))).json.title).toBe("Bracket");
    });

    it("caps how many drawings one account can store", async () => {
      const server = await start();
      const ann = await signedIn(server, "ann@example.com");
      for (let i = 0; i < MAX_DRAWINGS_PER_USER; i++) {
        server.db.drawings.create({
          ownerId: "dev:ann@example.com",
          title: `d${i}`,
          documentJson: "{}",
          paramsText: "",
          visibility: "private",
        });
      }
      const res = await ann.post("/api/drawings", newDrawing());
      expect(res.status).toBe(409);
      expect(res.json.error).toMatch(/limit/);
    });
  });
});
