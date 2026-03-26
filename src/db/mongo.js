const mongoose = require("mongoose");

async function connectMongo(url) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(url, {
    autoIndex: true
  });
  return mongoose.connection;
}

module.exports = { connectMongo };
