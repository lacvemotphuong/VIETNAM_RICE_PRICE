const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    model: { type: String, enum: ['ann', 'lstm', 'sarimax', 'xgboost'], required: true },
    input: { type: mongoose.Schema.Types.Mixed, required: true },
    predictions: { type: [Number], required: true, validate: (values) => values.length > 0 },
    actualHistory: {
      type: [{ month: { type: String, required: true }, price: { type: Number, default: null } }],
      default: undefined,
    },
    unit: { type: String, required: true },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

predictionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Prediction', predictionSchema);