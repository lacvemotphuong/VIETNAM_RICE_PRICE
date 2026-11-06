const axios = require('axios');

const aiClient = axios.create({
  baseURL: process.env.FASTAPI_URL || 'http://127.0.0.1:8000',
  timeout: Number(process.env.FASTAPI_TIMEOUT_MS || 120000),
});

async function getModels() {
  try {
    const response = await aiClient.get('/models');
    return response.data;
  } catch (error) {
    if (error.response) {
      const detail = error.response.data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message || 'The ML service model status is unavailable.';
      throw Object.assign(new Error(message), {
        status: error.response.status,
        code: typeof detail === 'object' ? detail.code : undefined,
      });
    }
    if (error.code === 'ECONNABORTED') {
      throw Object.assign(new Error('The ML service timed out while checking model status.'), { status: 504 });
    }
    throw Object.assign(new Error('The ML service could not be reached. Start or restart FastAPI and try again.'), { status: 503 });
  }
}

async function getOptions() {
  try {
    const response = await aiClient.get('/options');
    return response.data;
  } catch (error) {
    if (error.response) {
      const detail = error.response.data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message || 'Training data options are unavailable.';
      throw Object.assign(new Error(message), {
        status: error.response.status,
        code: typeof detail === 'object' ? detail.code : undefined,
      });
    }
    if (error.code === 'ECONNABORTED') {
      throw Object.assign(new Error('The ML service timed out.'), { status: 504 });
    }
    throw Object.assign(new Error('The ML service could not be reached.'), { status: 503 });
  }
}

async function predict(body) {
  try {
    const response = await aiClient.post('/predict', body, {
      timeout: Number(process.env.FASTAPI_PREDICTION_TIMEOUT_MS || 180000),
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const detail = error.response.data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message || 'The selected model is unavailable.';
      throw Object.assign(new Error(message), {
        status: error.response.status,
        code: typeof detail === 'object' ? detail.code : undefined,
      });
    }
    if (error.code === 'ECONNABORTED') {
      throw Object.assign(new Error('The ML service timed out.'), { status: 504 });
    }
    throw Object.assign(new Error('The ML service could not be reached.'), { status: 503 });
  }
}

module.exports = { getModels, getOptions, predict };
