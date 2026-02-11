const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

/* ===============================
   1️⃣ COMPANY LIST ENDPOINT
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
    console.error("Company list error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to load companies list",
    });
  }
});

/* ===============================
   2️⃣ IPO RESULT CHECK ENDPOINT
   =============================== */

app.get("/ipo/check", async (req, res) => {
  const { boid, companyId } = req.query;

  if (!boid || !companyId) {
    return res.status(400).json({
      success: false,
      message: "Missing boid or companyId",
    });
  }

  try {
    const response = await axios.post(
      "https://iporesult.cdsc.com.np/",
      new URLSearchParams({
        boid: boid,
        companyShareId: companyId,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        timeout: 15000,
      }
    );

    const html = response.data.toString().toLowerCase();

    let allotted = false;

    if (html.includes("not allotted")) {
      allotted = false;
    } else if (html.includes("allotted")) {
      allotted = true;
    }

    res.json({
      success: true,
      boid,
      companyId,
      allotted,
    });
  } catch (error) {
    console.error("CDSC result check failed:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch result from CDSC",
    });
  }
});

/* ===============================
   3️⃣ ROOT TEST ENDPOINT
   =============================== */

app.get("/", (req, res) => {
  res.send("IPO Backend API is running 🚀");
});

/* ===============================
   START SERVER
   =============================== */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
