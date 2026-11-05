require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const asyncHandler = require('./middleware/asyncHandler');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const predictionRoutes = require('./routes/predictions');
const userRoutes = require('./routes/users');
const priceRoutes = require('./routes/prices');

const requiredEnvironment = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
if (missingEnvironment.length) {
  throw new Error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
}
if (process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters.');
}

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()),
    credentials: false,
  })
);
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', asyncHandler(async (_req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({ status: databaseConnected ? 'ok' : 'degraded', database: databaseConnected });
}));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/prices', priceRoutes);
app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 5000);

async function start() {
  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(port, () => console.log(`Rice price API listening on port ${port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start API server:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, start };