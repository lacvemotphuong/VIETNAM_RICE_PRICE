import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PredictionResult from '../components/PredictionResult';
import { getApiError, predictionsApi } from '../api';

export default function PredictionDetail() {
  const { id } = useParams();
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    predictionsApi.detail(id)
      .then(({ data }) => {
        if (!active) return;
        if (!data.prediction || !Array.isArray(data.prediction.predictions)) {
          throw new Error('Không thể đọc chi tiết dự đoán này.');
        }
        setPrediction({
          ...data.prediction,
          generatedAt: data.prediction.generatedAt || data.prediction.createdAt,
          actualHistory: data.prediction.actualHistory || [],
        });
      })
      .catch((requestError) => {
        if (active) setError(requestError.response ? getApiError(requestError) : requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  if (loading) return <div className="page-message" role="status">Đang tải chi tiết dự đoán...</div>;
  if (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="alert-error" role="alert">{error}</div>
        <Link to="/history" className="inline-flex text-sm font-semibold text-emerald-800 hover:underline">← Quay lại lịch sử</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Lịch sử dự báo</p>
          <h1 className="page-title">Chi tiết kết quả</h1>
        </div>
        <Link to="/history" className="btn-secondary">← Quay lại lịch sử</Link>
      </div>

      <PredictionResult prediction={prediction} />

      {(prediction.input?.target || prediction.input?.product || prediction.input?.location || prediction.input?.horizon_days || prediction.input?.horizon_months) && (
        <section className="panel">
          <p className="eyebrow">Thông tin dự báo</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Lựa chọn của bạn</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {prediction.input.target && (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chuỗi giá</dt>
                <dd className="mt-2 text-sm font-medium text-slate-800">{prediction.input.target}</dd>
              </div>
            )}
            {prediction.input.product && (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sản phẩm</dt>
                <dd className="mt-2 text-sm font-medium text-slate-800">{prediction.input.product}</dd>
              </div>
            )}
            {prediction.input.location && (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Khu vực</dt>
                <dd className="mt-2 text-sm font-medium text-slate-800">{prediction.input.location}</dd>
              </div>
            )}
            {prediction.input.horizon_months && (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thời gian dự báo</dt>
                <dd className="mt-2 text-sm font-medium text-slate-800">{prediction.input.horizon_months} tháng</dd>
              </div>
            )}
            {prediction.input.horizon_days && (
              <div className="rounded-xl bg-slate-50 p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Thời gian dự báo</dt>
                <dd className="mt-2 text-sm font-medium text-slate-800">{prediction.input.horizon_days} ngày</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
