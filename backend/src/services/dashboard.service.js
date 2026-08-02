const Product = require("../models/Product");
const Document = require("../models/Document");
const Notification = require("../models/Notification");

async function getDashboardData(userId) {
  const now = new Date();
  const expiryLimit = new Date(now);
  expiryLimit.setDate(expiryLimit.getDate() + 30);

  const base = { userId, isDeleted: false };

  const [
    totalProducts,
    expiringSoonCount,
    totalDocuments,
    unreadNotificationsCount,
    recentProducts,
    expiringSoon
  ] = await Promise.all([
    Product.countDocuments(base),
    Product.countDocuments({
      ...base,
      warrantyExpiryDate: { $gte: now, $lte: expiryLimit }
    }),
    Document.countDocuments({ userId }),
    Notification.countDocuments({ userId, isRead: false }),
    Product.find(base).sort({ createdAt: -1 }).limit(5),
    Product.find({
      ...base,
      warrantyExpiryDate: { $gte: now, $lte: expiryLimit }
    }).sort({ warrantyExpiryDate: 1 }).limit(10)
  ]);

  return {
    totalProducts,
    expiringSoonCount,
    totalDocuments,
    unreadNotificationsCount,
    recentProducts,
    expiringSoon
  };
}

module.exports = {
  getDashboardData
};
