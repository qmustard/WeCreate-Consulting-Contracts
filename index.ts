import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = new Hono();
app.use("*", logger());
app.use("*", cors({ origin: "*", allowMethods: ["POST", "GET", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] }));
app.options("*", (c) => c.text("", 204));

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

app.post("/presign", async (c) => {
  try {
    const { clientName } = await c.req.json();
    const now = new Date();
    const datestamp = now.toISOString().split("T")[0];
    const timestamp = now.getTime();
    const safeName = (clientName ?? "unknown").replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    const key = `Contracts/${datestamp}/${safeName}-${timestamp}.pdf`;
    const command = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: "application/pdf" });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    return c.json({ success: true, url, key });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

export default { port: Number(process.env.PORT || 3000), fetch: app.fetch };
