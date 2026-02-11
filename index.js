const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

/**
 * COMPANY LIST ENDPOINT
 * This returns static JSON from companies.json
 */
app.get("/ipo/companies", (req, res) => {
  const companies = require("./companies.json");

  res.json({
    success: true,
    count: companies.length,
    companies: companies,
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
