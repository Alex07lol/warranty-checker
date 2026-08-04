const mongoose = require("mongoose");

const serviceHistorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    serviceDate: {
      type: Date,
      required: true
    },
    serviceType: {
      type: String,
      enum: ["repair", "maintenance", "inspection", "replacement", "other"],
      required: true
    },
    serviceProvider: String,
    cost: {
      type: Number,
      min: 0
    },
    currency: String,
    description: String,
    documentIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document"
    }],
    nextServiceDate: Date
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("ServiceHistory", serviceHistorySchema);
