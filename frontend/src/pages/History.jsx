import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiError, predictionsApi } from '../api';

const formatDate = (value) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const formatNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

export default function History() {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    predictionsApi.history({ page })
      .then(({ data }) => {
        if (!active) return;
        if (!Array.isArray(data.items) || !data.pagination) throw new Error('Không thể đọc danh sách lịch sử dự đoán.');
        setItems(data.items);
        setPagination(data.pagination);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response ? getApiError(requestError) : requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="eyebrow">Tài khoản của bạn</p>
          <h1 className="page-title">Lịch sử dự đoán</h1>
          <p className="mt-2 text-sm text-slate-500">Các kết quả đã được lưu từ những lần dự đoán thành công.</p>
        </div>
        <Link to="/predict" className="btn-primary">Tạo dự đoán <span aria-hidden="true">→</span></Link>
      </div>

      {error && <div className="alert-error" role="alert">{error}</div>}
      {loading ? (
        <div className="page-message" role="status">Đang tải lịch sử...</div>
      ) : error ? null : items.length === 0 ? (
        <div className="panel py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-xl text-emerald-800" aria-hidden="true">↗</span>
          <h2 className="mt-4 font-bold text-slate-900">Chưa có dự đoán nào</h2>
          <p className="mt-1 text-sm text-slate-500">Kết quả sẽ xuất hiện ở đây sau khi một dự đoán được lưu thành công.</p>
          <Link to="/predict" className="mt-5 inline-flex font-semibold text-emerald-800 hover:underline">Tạo dự đoán đầu tiên →</Link>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <Link
                className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md sm:p-5"
                key={item._id}
                to={`/history/${item._id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800">Dự báo</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">Dự báo giá · {formatDate(item.createdAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.input?.target
                          ? `${item.input.target} · `
                          : item.input?.product && item.input?.location
                            ? `${item.input.product} · ${item.input.location} · `
                          : ''}
                        {item.input?.horizon_months
                          ? `${item.input.horizon_months} tháng · `
                          : ''}
                        {Array.isArray(item.predictions) ? item.predictions.length : 0} mốc giá
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Đã lưu</span>
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <span className="text-xs text-slate-500">Giá dự đoán đầu tiên</span>
                  <span className="text-lg font-bold text-slate-900">
                    {formatNumber.format(item.predictions?.[0])}
                    <span className="ml-1 text-sm font-medium text-slate-500">{item.unit}</span>
                  </span>
                </div>
                <p className="mt-3 text-right text-xs font-semibold text-emerald-700 group-hover:text-emerald-900">Xem chi tiết <span aria-hidden="true">›</span></p>
              </Link>
            ))}
          </div>
          {pagination && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <p className="text-slate-500">Tổng cộng {pagination.total} dự đoán · Trang {pagination.page} / {Math.max(pagination.pages, 1)}</p>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Trước</button>
                <button type="button" className="btn-secondary !px-3 !py-2" onClick={() => setPage((current) => current + 1)} disabled={page >= pagination.pages}>Sau</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
