const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user', immutable: true },
  },
  { timestamps: true, versionKey: false }
);

userSchema.set('toJSON', {
  transform(_document, result) {
    delete result.passwordHash;
    delete result.__v;
    return result;
  },
});

module.exports = mongoose.model('User', userSchema);