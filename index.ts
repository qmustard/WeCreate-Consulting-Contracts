import { Hono } from "hono";
import { cors } from "hono/cors";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

const s3 = new S3Client({
  region: process.env.WASABI_REGION ?? "us-east-1",
  endpoint: process.env.WASABI_ENDPOINT ?? "https://s3.wasabisys.com",
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY ?? "",
  },
});

const BUCKET = process.env.WASABI_BUCKET ?? "";

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "consulting-contracts-api" });
});

app.post("/upload-contract", async (c) => {
  try {
    const formData = await c.req.formData();

    const file = formData.get("file") as File | null;
    const clientName = formData.get("clientName") as string | null;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    if (!clientName) {
      return c.json({ error: "No clientName provided" }, 400);
    }

    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const timestamp = Date.now();
    const safeName = clientName.replace(/[^a-zA-Z0-9-_]/g, "-");
    const key = `signed-agreements/${date}/${safeName}-${timestamp}.pdf`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: "application/pdf",
      })
    );

    return c.json({
      success: true,
      key,
      bucket: BUCKET,
      message: "Contract uploaded successfully",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Upload error:", message);
    return c.json({ error: "Failed to upload contract", details: message }, 500);
  }
});

export default app;

Bun.serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
});

console.log(`consulting-contracts-api running on port ${process.env.PORT ?? 3000}`);
