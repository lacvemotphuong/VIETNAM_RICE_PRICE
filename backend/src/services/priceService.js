const RicePrice = require('../models/RicePrice');

async function listPrices(query) {
  const filter = {};
  if (query.province) filter.province = query.province;
  if (query.variety) filter.variety = query.variety;
  if (query.from || query.to) {
    filter.observedAt = {};
    if (query.from) filter.observedAt.$gte = new Date(query.from);
    if (query.to) filter.observedAt.$lte = new Date(query.to);
  }
  return RicePrice.find(filter).sort({ observedAt: -1 }).limit(Number(query.limit || 100)).lean();
}

module.exports = { listPrices };
