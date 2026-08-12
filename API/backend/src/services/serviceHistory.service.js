const mongoose = require("mongoose");
const ServiceHistory = require("../models/ServiceHistory");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");

async function assertOwner(productId, userId) {
  if (!mongoose.isValidObjectId(productId)) {
    throw new AppError("Invalid product ID", 400);
  }

  const product = await Product.findById(productId);

  if (!product || product.isDeleted) {
    throw new AppError("Product not found", 404);
  }

  if (product.userId.toString() !== userId.toString()) {
    throw new AppError("Forbidden", 403);
  }
}

async function getServiceHistory(productId, userId) {
  await assertOwner(productId, userId);
  // Product-scoped lists are naturally bounded; the cap only guards against
  // pathological growth. Kept as a plain array (no pagination metadata) so
  // the existing timeline UI contract is unchanged.
  return ServiceHistory.find({ productId, userId })
    .sort({ serviceDate: -1 })
    .limit(200);
}

async function addServiceRecord(productId, userId, data) {
  await assertOwner(productId, userId);
  return ServiceHistory.create({ productId, userId, ...data });
}

async function getServiceRecordById(productId, recordId, userId) {
  await assertOwner(productId, userId);

  if (!mongoose.isValidObjectId(recordId)) {
    throw new AppError("Invalid record ID", 400);
  }

  const record = await ServiceHistory.findOne({ _id: recordId, productId, userId });

  if (!record) {
    throw new AppError("Service record not found", 404);
  }

  return record;
}

async function updateServiceRecord(productId, recordId, userId, data) {
  const record = await getServiceRecordById(productId, recordId, userId);
  Object.assign(record, data);
  await record.save();
  return record;
}

async function deleteServiceRecord(productId, recordId, userId) {
  const record = await getServiceRecordById(productId, recordId, userId);
  await record.deleteOne();
}

module.exports = {
  getServiceHistory,
  addServiceRecord,
  getServiceRecordById,
  updateServiceRecord,
  deleteServiceRecord
};
