const priceService = require('../services/priceService');

async function listPrices(req, res) {
  const { from, to } = req.query;
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) {
    throw Object.assign(new Error("'from' and 'to' must be valid dates."), { status: 400 });
  }
  if (from && to && new Date(from) > new Date(to)) {
    throw Object.assign(new Error("'from' must be earlier than or equal to 'to'."), { status: 400 });
  }
  const limit = Number(req.query.limit || 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw Object.assign(new Error("'limit' must be an integer between 1 and 500."), { status: 400 });
  }
  const prices = await priceService.listPrices({ ...req.query, limit });
  res.json({ items: prices, count: prices.length });
}

module.exports = { listPrices };
