const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ===============================
   🧠 SIMPLE IN-MEMORY CACHE
   =============================== */

const resultCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCacheKey(boid, companyId) {
  return `${boid}_${companyId}`;
}

function getCachedResult(boid, companyId) {
  const key = getCacheKey(boid, companyId);
  const cached = resultCache.get(key);

  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    resultCache.delete(key);
    return null;
  }

  return cached.data;
}

function setCachedResult(boid, companyId, data) {
  const key = getCacheKey(boid, companyId);
  resultCache.set(key, {
    data,
    timestamp: Date.now(),
  });
}

/* ===============================
   🚦 RATE LIMIT (Basic Protection)
   =============================== */

let requestCount = 0;
const MAX_REQUESTS_PER_MINUTE = 100;

setInterval(() => {
  requestCount = 0;
}, 60 * 1000);

app.use((req, res, next) => {
  requestCount++;
  if (requestCount > MAX_REQUESTS_PER_MINUTE) {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Try again later.",
    });
  }
  next();
});

/* ===============================
   1️⃣ COMPANY LIST
   =============================== */

app.get("/ipo/companies", (req, res) => {
  try {
    const companies = require("./companies.json");

    res.json({
      success: true,
      count: companies.length,
      companies: companies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load companies",
    });
  }
});

/* ===============================
   2️⃣ SINGLE RESULT CHECK
   =============================== */

app.get("/ipo/check", async (req, res) => {
  const { boid, companyId } = req.query;

  if (!boid || !companyId) {
    return res.status(400).json({
      success: false,
      message: "Missing boid or companyId",
    });
  }

  const cached = getCachedResult(boid, companyId);
  if (cached) {
    return res.json({
      success: true,
      cached: true,
      ...cached,
    });
  }

  try {
    const response = await axios.post(
      "https://iporesult.cdsc.com.np/",
      new URLSearchParams({
        boid,
        companyShareId: companyId,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 15000,
      }
    );

    const html = response.data.toLowerCase();

    let allotted = false;

    if (html.includes("not allotted")) {
      allotted = false;
    } else if (html.includes("allotted")) {
      allotted = true;
    }

    const result = { boid, companyId, allotted };

    setCachedResult(boid, companyId, result);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CDSC request failed",
    });
  }
});

/* ===============================
   3️⃣ BULK CHECK (NEW 🔥)
   =============================== */

app.post("/ipo/bulk-check", express.json(), async (req, res) => {
  const { boids, companyId } = req.body;

  if (!boids || !Array.isArray(boids) || !companyId) {
    return res.status(400).json({
      success: false,
      message: "Invalid request body",
    });
  }

  const results = [];

  for (const boid of boids) {
    try {
      const cached = getCachedResult(boid, companyId);
      if (cached) {
        results.push({ ...cached, cached: true });
        continue;
      }

      const response = await axios.post(
        "https://iporesult.cdsc.com.np/",
        new URLSearchParams({
          boid,
          companyShareId: companyId,
        }).toString(),
        {
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          timeout: 15000,
        }
      );

      const html = response.data.toLowerCase();

      let allotted = false;

      if (html.includes("not allotted")) {
        allotted = false;
      } else if (html.includes("allotted")) {
        allotted = true;
      }

      const result = { boid, companyId, allotted };

      setCachedResult(boid, companyId, result);
      results.push(result);
    } catch (e) {
      results.push({
        boid,
        companyId,
        allotted: false,
        error: true,
      });
    }
  }

  res.json({
    success: true,
    count: results.length,
    results,
  });
});

/* ===============================
   ROOT
   =============================== */

app.get("/", (req, res) => {
  res.send("IPO Backend API Running 🚀");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
