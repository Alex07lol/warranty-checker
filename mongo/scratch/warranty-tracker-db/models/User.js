const mongoose = require("mongoose");

const notificationPreferencesSchema = new mongoose.Schema(
  {
    expiryAlerts: {
      type: Boolean,
      default: true,
    },
    reminderDays: {
      type: [Number],
      default: [30, 7, 1],
      validate: {
        validator: (arr) => arr.every((d) => Number.isInteger(d) && d > 0),
        message: "reminderDays must be an array of positive integers",
      },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false, // never returned in queries by default
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    profilePicture: {
      type: String,
      default: null,
      trim: true,
    },
    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true, // adds createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ isActive: 1 });

// Virtual: total products count (populated by application layer if needed)
userSchema.virtual("products", {
  ref: "Product",
  localField: "_id",
  foreignField: "userId",
});

module.exports = mongoose.model("User", userSchema);
