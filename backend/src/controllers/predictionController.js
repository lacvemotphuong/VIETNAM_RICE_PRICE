const Prediction = require('../models/Prediction');
const mongoose = require('mongoose');
const predictionService = require('../services/predictionService');

async function listModels(_req, res) {
  res.json(await predictionService.getModels());
}

async function listOptions(_req, res) {
  res.json(await predictionService.getOptions());
}

async function createPrediction(req, res) {
  const model = String(req.body?.model || '').toLowerCase();
  if (!['ann', 'lstm', 'sarimax', 'xgboost'].includes(model)) {
    throw Object.assign(new Error('Choose a supported model: ann, lstm, sarimax or xgboost.'), { status: 400 });
  }
  const { model: _model, ...payload } = req.body;
  const result = await predictionService.predict({ ...payload, model });
  const saved = await Prediction.create({
    user: req.user.id,
    model: result.model,
    input: result.input,
    predictions: result.predictions,
    actualHistory: result.actual_history,
    unit: result.unit,
    generatedAt: result.generated_at,
  });
  res.status(201).json({
    prediction: {
      id: saved.id,
      model: saved.model,
      input: saved.input,
      predictions: saved.predictions,
      actualHistory: saved.actualHistory,
      unit: saved.unit,
      generatedAt: saved.generatedAt,
      createdAt: saved.createdAt,
    },
  });
}

async function listHistory(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const filter = { user: req.user.id };
  const [items, total] = await Promise.all([
    Prediction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Prediction.countDocuments(filter),
  ]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

async function getPrediction(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    throw Object.assign(new Error('Prediction was not found.'), { status: 404 });
  }
  const prediction = await Prediction.findOne({ _id: req.params.id, user: req.user.id }).lean();
  if (!prediction) {
    throw Object.assign(new Error('Prediction was not found.'), { status: 404 });
  }
  res.json({ prediction });
}

module.exports = { listModels, listOptions, createPrediction, listHistory, getPrediction };
