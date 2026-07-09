require("dotenv").config();

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

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error(err);
  }
};

startServer();