import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({
  origin: "*",
  allowMethods: ["POST", "GET", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Accept"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: false,
}));

app.options("*", (c) => {
  return c.text("", 204);
});

const s3 = new S3Client({
  endpoint: process.env.WASABI_ENDPOINT ?? "https://s3.us-east-1.wasabisys.com",
  region: process.env.WASABI_REGION ?? "us-east-1",
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY ?? "",
    secretAccessKey: process.env.WASABI_SECRET_KEY ?? "",
  },
  forcePathStyle: true,
});

const BUCKET = process.env.WASABI_BUCKET ?? "consulting-contracts";

app.get("/health", (c) => c.json({ status: "ok", t: Date.now() }));

app.post("/upload-contract", async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const clientName = (formData.get("clientName") as string) ?? "unknown-client";

    if (!file) return c.json({ error: "No file provided" }, 400);

    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);

    const now = new Date();
    const datestamp = now.toISOString().split("T")[0];
    const timestamp = now.getTime();
    const safeName = clientName.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    const key = `Contracts/${datestamp}/${safeName}-${timestamp}.pdf`;

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
      Metadata: {
        "client-name": clientName,
        "signed-at": now.toISOString(),
        "uploaded-by": "wecreate-proposal",
      },
    }));

    console.log(`[upload] Saved: ${key}`);
    return c.json({ success: true, key, bucket: BUCKET });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload error]", msg);
    return c.json({ error: msg }, 500);
  }
});

export default {
  port: Number(process.env.PORT || 3000),
  fetch: app.fetch,
};
