const axios = require("axios");

let sessionCookie = null;
let loginTime = 0;

const PANEL_URL = (process.env.XUI_PANEL_URL || "").replace(/\/$/, "");
const XUI_USERNAME = process.env.XUI_USERNAME || "";
const XUI_PASSWORD = process.env.XUI_PASSWORD || "";

async function login() {
  if (!PANEL_URL || !XUI_USERNAME || !XUI_PASSWORD) {
    throw new Error("3x-UI environment variables are missing");
  }

  const response = await axios.post(
    `${PANEL_URL}/login`,
    new URLSearchParams({
      username: XUI_USERNAME,
      password: XUI_PASSWORD
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 15000,
      validateStatus: () => true
    }
  );

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`3x-UI login failed: HTTP ${response.status}`);
  }

  const cookies = response.headers["set-cookie"];

  if (!cookies || !cookies.length) {
    throw new Error("3x-UI did not return a session cookie");
  }

  sessionCookie = cookies
    .map(cookie => cookie.split(";")[0])
    .join("; ");

  loginTime = Date.now();

  return true;
}

async function request(path) {
  if (!sessionCookie || Date.now() - loginTime > 20 * 60 * 1000) {
    await login();
  }

  let response = await axios.get(`${PANEL_URL}${path}`, {
    headers: {
      Cookie: sessionCookie
    },
    timeout: 15000,
    validateStatus: () => true
  });

  if (response.status === 401 || response.status === 403) {
    await login();

    response = await axios.get(`${PANEL_URL}${path}`, {
      headers: {
        Cookie: sessionCookie
      },
      timeout: 15000
    });
  }

  return response.data;
}

async function getInbounds() {
  return request("/panel/api/inbounds/list");
}

function findClient(data, email) {
  const inbounds = data?.obj || data?.data || [];

  if (!Array.isArray(inbounds)) {
    return null;
  }

  for (const inbound of inbounds) {
    let clients = inbound?.settings;

    if (typeof clients === "string") {
      try {
        clients = JSON.parse(clients);
      } catch {
        clients = null;
      }
    }

    clients = clients?.clients || [];

    const client = clients.find(
      item => String(item.email || "").toLowerCase() === email.toLowerCase()
    );

    if (client) {
      return {
        inbound,
        client
      };
    }
  }

  return null;
}

async function getUser(email) {
  const data = await getInbounds();
  return findClient(data, email);
}

module.exports = {
  getUser
};
