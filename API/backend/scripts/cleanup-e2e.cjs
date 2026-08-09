// Delete test users created by E2E runs (and their data) from Atlas.
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: "warrantyvault_db",
    serverSelectionTimeoutMS: 15000
  });
  const User = require("../src/models/User");
  const Product = require("../src/models/Product");
  const Document = require("../src/models/Document");
  const Notification = require("../src/models/Notification");
  const ServiceHistory = require("../src/models/ServiceHistory");

  const all = await User.find({});
  const ids = all
    .filter((u) => /confirm_e2e|e2e_|finale2e|storee2e|autocreate|viewproxy|smoke-|pdf-|imgt-|pdfdbg-/i.test(u.email || ""))
    .map((u) => u._id);
  console.log("test users to clean:", ids.length);
  if (ids.length) {
    const products = await Product.find({ userId: { $in: ids } }).select("_id");
    const pIds = products.map((p) => p._id);
    await Notification.deleteMany({ userId: { $in: ids } });
    await ServiceHistory.deleteMany({ productId: { $in: pIds } });
    await Document.deleteMany({ userId: { $in: ids } });
    await Product.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    console.log("cleaned");
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
