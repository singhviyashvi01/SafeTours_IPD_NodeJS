const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

console.log("1. Environment loaded");

const app = require("./app");
console.log("2. App loaded");

const connectDB = require("./config/db");
console.log("3. DB module loaded");

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    console.log("4. Connecting to MongoDB...");
    await connectDB();

    console.log("5. MongoDB connected");

    // Start community incident expiry scheduler background job
    const { startExpiryScheduler } = require('./scheduler/communityExpiryJob');
    startExpiryScheduler();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(`\n❌ Port ${PORT} is already in use by another process.`);
        console.error(`   Run: lsof -iTCP:${PORT} -sTCP:LISTEN  to see what is using it.`);
        console.error(`   Then change PORT in your .env file to a free port (e.g. 5001, 8080).\n`);
      } else {
        console.error("Server error:", err);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
};

startServer();