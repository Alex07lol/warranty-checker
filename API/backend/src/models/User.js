const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const notificationPreferencesSchema = new mongoose.Schema(
  {
    expiryAlerts: {
      type: Boolean,
      default: true
    },
    reminderDays: {
      type: [Number],
      default: [30, 7, 1],
      validate: {
        validator: (days) => days.every((day) => Number.isInteger(day) && day > 0),
        message: "Reminder days must contain positive integers"
      }
    }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: 2,
      maxlength: 100,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    profilePicture: {
      type: String,
      default: null
    },
    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) {
    return next();
  }

  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  return next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

module.exports = mongoose.model("User", userSchema);
