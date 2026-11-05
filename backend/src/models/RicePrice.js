const mongoose = require('mongoose');

const ricePriceSchema = new mongoose.Schema(
  {
    province: { type: String, required: true, trim: true },
    variety: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true },
    observedAt: { type: Date, required: true, index: true },
    source: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

ricePriceSchema.index({ province: 1, variety: 1, observedAt: -1 });

module.exports = mongoose.model('RicePrice', ricePriceSchema);
