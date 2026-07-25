import { promises as fs } from "fs";
import path from "path";

// Projects are stored as JSON files under <repo>/projects. This route runs on
// the Node.js runtime so it can read/write the local filesystem in dev.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIR = path.join(process.cwd(), "projects");

// Restrict names to a safe, path-traversal-proof set.
const safeName = (s: string) => s.replace(/[^a-zA-Z0-9 _-]/g, "_").trim().slice(0, 64);

async function ensureDir() {
  await fs.mkdir(DIR, { recursive: true });
}

export async function GET(req: Request) {
  await ensureDir();
  const name = new URL(req.url).searchParams.get("name");
  if (name) {
    try {
      const data = await fs.readFile(path.join(DIR, safeName(name) + ".json"), "utf8");
      return new Response(data, { headers: { "content-type": "application/json" } });
    } catch {
      return Response.json({ error: "not found" }, { status: 404 });
    }
  }
  const files = await fs.readdir(DIR);
  const projects = files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
  return Response.json({ projects });
}

export async function POST(req: Request) {
  await ensureDir();
  let body: { name?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = safeName(String(body?.name ?? ""));
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  await fs.writeFile(
    path.join(DIR, name + ".json"),
    JSON.stringify(body?.data ?? {}, null, 2),
    "utf8",
  );
  return Response.json({ ok: true, name });
}

export async function DELETE(req: Request) {
  await ensureDir();
  const name = new URL(req.url).searchParams.get("name");
  if (!name) return Response.json({ error: "name required" }, { status: 400 });
  try {
    await fs.unlink(path.join(DIR, safeName(name) + ".json"));
  } catch {
    /* already gone */
  }
  return Response.json({ ok: true });
}
