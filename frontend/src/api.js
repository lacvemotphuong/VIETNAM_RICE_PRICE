import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rice-price-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getApiError(error) {
  const apiMessage =
    error.response?.data?.error?.message ||
    error.response?.data?.detail?.message ||
    (typeof error.response?.data?.detail === 'string' ? error.response.data.detail : null);
  if (apiMessage) return apiMessage;
  if (error.response?.status >= 500) return 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
  if (!error.response) return 'Không thể kết nối hệ thống. Vui lòng kiểm tra kết nối rồi thử lại.';
  return error.message || 'Đã xảy ra lỗi. Vui lòng thử lại.';
}

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
};

export const userApi = {
  me: () => api.get('/users/me'),
  update: (data) => api.patch('/users/me', data),
};

export const pricesApi = {
  list: (params) => api.get('/prices', { params }),
};

export const predictionsApi = {
  models: () => api.get('/predictions/models'),
  options: () => api.get('/predictions/options'),
  create: (data) => api.post('/predictions', data),
  history: (params) => api.get('/predictions', { params }),
  detail: (id) => api.get(`/predictions/${id}`),
};