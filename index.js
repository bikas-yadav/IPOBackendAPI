const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* =========================================================
   TEMP SESSION STORAGE (In-Memory)
========================================================= */

let sessionCookie = "";
let captchaIdentifier = "";

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "IPO Backend Running",
  });
});

/* =========================================================
   LOAD COMPANY LIST FROM company.json
========================================================= */

app.get("/ipo/companies", (req, res) => {
  try {
    const filePath = path.join(__dirname, "companies.json");

    if (!fs.existsSync(filePath)) {
      return res.status(500).json({
        success: false,
        message: "company.json not found",
      });
    }

    const rawData = fs.readFileSync(filePath);
    const companies = JSON.parse(rawData);

    res.json({
      success: true,
      count: companies.length,
      companies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load company list",
      error: error.message,
    });
  }
});

/* =========================================================
   FETCH CAPTCHA + SESSION
========================================================= */

app.get("/ipo/get-captcha", async (req, res) => {
  try {
    const response = await axios.get(
      "https://iporesult.cdsc.com.np/",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      }
    );

    const cookies = response.headers["set-cookie"];
    if (cookies) {
      sessionCookie = cookies
        .map((c) => c.split(";")[0])
        .join("; ");
    }

    const $ = cheerio.load(response.data);

    captchaIdentifier = $("input[name='captchaIdentifier']")
      .attr("value");

    const captchaImagePath =
      $("img[id='captcha-image']").attr("src");

    if (!captchaIdentifier || !captchaImagePath) {
      return res.status(500).json({
        success: false,
        message: "Captcha parsing failed",
      });
    }

    const captchaUrl =
      "https://iporesult.cdsc.com.np" +
      captchaImagePath;

    res.json({
      success: true,
      captchaIdentifier,
      captchaUrl,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch captcha",
      error: error.message,
    });
  }
});

/* =========================================================
   BULK CHECK WITH CAPTCHA VALIDATION
========================================================= */

app.post("/ipo/bulk-check", async (req, res) => {
  const { companyId, boids, usercaptcha } = req.body;

  if (!companyId || !boids || !usercaptcha) {
    return res.status(400).json({
      success: false,
      message: "Missing parameters",
    });
  }

  if (!sessionCookie || !captchaIdentifier) {
    return res.status(400).json({
      success: false,
      message: "Captcha session expired. Fetch captcha again.",
    });
  }

  const results = [];

  try {
    /* ---------- Validate captcha with first BOID ---------- */

    const firstCheck = await axios.post(
      "https://iporesult.cdsc.com.np/result/result/check",
      {
        companyShareId: companyId,
        boid: boids[0],
        captchaIdentifier,
        usercaptcha,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      }
    );

    if (
      firstCheck.data.success === false &&
      firstCheck.data.message &&
      firstCheck.data.message
        .toLowerCase()
        .includes("captcha")
    ) {
      sessionCookie = "";
      captchaIdentifier = "";

      return res.json({
        success: false,
        captchaError: true,
        message: "Invalid captcha",
      });
    }

    results.push({
      boid: boids[0],
      allotted: firstCheck.data.success === true,
      message: firstCheck.data.message,
    });

    /* ---------- Process remaining BOIDs ---------- */

    for (let i = 1; i < boids.length; i++) {
      const boid = boids[i];

      try {
        const response = await axios.post(
          "https://iporesult.cdsc.com.np/result/result/check",
          {
            companyShareId: companyId,
            boid,
            captchaIdentifier,
            usercaptcha,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Cookie: sessionCookie,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            },
          }
        );

        results.push({
          boid,
          allotted: response.data.success === true,
          message: response.data.message,
        });
      } catch (error) {
        results.push({
          boid,
          allotted: false,
          message: "Error checking result",
        });
      }
    }

    sessionCookie = "";
    captchaIdentifier = "";

    res.json({
      success: true,
      count: results.length,
      results,
    });
  } catch (error) {
    sessionCookie = "";
    captchaIdentifier = "";

    res.status(500).json({
      success: false,
      message: "Bulk check failed",
      error: error.message,
    });
  }
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
