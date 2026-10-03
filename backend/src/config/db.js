const mongoose = require("mongoose");

const connectDB = async () => {
  const conn = await mongoose.connect(process.env.MONGO_URI);

  // Never log the connection string: it contains credentials.
  console.log("Connected to:", conn.connection.host);
};

module.exports = connectDB;
