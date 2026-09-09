require("dotenv").config();

const express = require("express");
const path = require("path");

const { getUser } = require("./xui");

const app = express();

const PORT = process.env.PORT || 3000;

const SUB_UUID = process.env.SUB_UUID || "";
const SUB_HOST = process.env.SUB_HOST || "";
const SUB_PORT = process.env.SUB_PORT || "443";
const SUB_PARAMS = process.env.SUB_PARAMS || "";
const SUB_NAME = process.env.SUB_NAME || "AMIRALI-REALITY";

const SUB_EMAIL = process.env.SUB_EMAIL || "amirali";

app.set("trust proxy", 1);

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function formatBytes(bytes) {
  const value = Number(bytes || 0);

  if (!value) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];

  let index = 0;
  let size = value;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index++;
  }

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 2)} ${units[index]}`;
}

function buildVless() {
  if (!SUB_UUID || !SUB_HOST) {
    throw new Error("Subscription configuration is incomplete");
  }

  const query = SUB_PARAMS ? `?${SUB_PARAMS}` : "";

  return `vless://${SUB_UUID}@${SUB_HOST}:${SUB_PORT}${query}#${encodeURIComponent(
    SUB_NAME
  )}`;
}

function base64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

async function getSubscriptionData() {
  const user = await getUser(SUB_EMAIL);

  if (!user) {
    throw new Error(`User "${SUB_EMAIL}" was not found in 3x-UI`);
  }

  const client = user.client;

  const up = Number(client.up || 0);
  const down = Number(client.down || 0);

  const total = Number(client.totalGB || 0);

  const totalBytes = total > 0 ? total * 1024 * 1024 * 1024 : 0;

  const used = up + down;

  let expiry = 0;

  if (client.expiryTime) {
    expiry = Number(client.expiryTime);
  }

  const remaining = totalBytes
    ? Math.max(totalBytes - used, 0)
    : 0;

  return {
    upload: up,
    download: down,
    used,
    total: totalBytes,
    remaining,
    expiry
  };
}

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/api/status", async (req, res) => {
  try {
    const data = await getSubscriptionData();

    res.json({
      online: true,
      name: SUB_NAME,
      upload: data.upload,
      download: data.download,
      used: data.used,
      total: data.total,
      remaining: data.remaining,
      expiry: data.expiry
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      online: false,
      error: "Unable to read subscription information"
    });
  }
});

app.get("/sub/amirali", async (req, res) => {
  try {
    const data = await getSubscriptionData();

    const vless = buildVless();

    const userInfo = [
      `upload=${data.upload}`,
      `download=${data.download}`,
      `total=${data.total}`,
      `expire=${data.expiry}`
    ].join(";");

    res.set({
      "Content-Type": "text/plain; charset=utf-8",
      "subscription-userinfo": userInfo,
      "profile-title": Buffer.from(SUB_NAME).toString("base64"),
      "profile-update-interval": "6",
      "Cache-Control": "no-store"
    });

    res.send(base64(vless));
  } catch (error) {
    console.error(error.message);

    res.status(500).send("Subscription unavailable");
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`AMIRALI SUB running on port ${PORT}`);
});
