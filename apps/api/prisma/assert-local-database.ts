import "dotenv/config";

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  throw new Error("DIRECT_URL is required before resetting a database.");
}

const databaseUrl = new URL(directUrl);
const databaseName = databaseUrl.pathname.replace(/^\//, "");
const allowedHosts = new Set(["127.0.0.1", "::1", "localhost"]);
const allowedDatabases = new Set(["verilot", "verilot_test"]);

if (!allowedHosts.has(databaseUrl.hostname) || !allowedDatabases.has(databaseName)) {
  throw new Error("Database reset is restricted to the local VeriLot databases.");
}

console.info(`Local reset guard passed for ${databaseName}.`);
