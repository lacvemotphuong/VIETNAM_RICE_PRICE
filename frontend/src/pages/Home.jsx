import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getApiError, pricesApi } from '../api';
import { useAuth } from '../auth/useAuth';

const money = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const dateTime = (value) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const date = (value) => new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(value));

export default function Home() {
  const { user } = useAuth();
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    pricesApi.list({ limit: 90 })
      .then(({ data }) => {
        if (!Array.isArray(data.items)) throw new Error('API giá trả về dữ liệu không đúng định dạng.');
        setPrices(data.items);
      })
      .catch((requestError) => setError(requestError.response ? getApiError(requestError) : requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const latest = prices[0];
  const chartData = useMemo(() => {
    if (!latest) return [];
    return prices
      .filter((item) => item.province === latest.province && item.variety === latest.variety && item.unit === latest.unit)
      .slice()
      .reverse()
      .map((item) => ({
        label: date(item.observedAt),
        price: item.price,
        variety: item.variety,
        unit: item.unit,
      }));
  }, [latest, prices]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50 to-teal-50 p-6 shadow-sm sm:p-9">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="eyebrow">Thị trường lúa gạo Việt Nam</p>
            <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Theo dõi giá lúa và xem mức giá dự kiến
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              Giá hiển thị lấy từ dữ liệu thị trường hiện có. Mức giá dự báo chỉ mang tính tham khảo; giá thực tế có thể thay đổi.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={user ? '/predict' : '/register'} className="btn-primary">
                {user ? 'Tạo dự đoán' : 'Bắt đầu sử dụng'}
                <span aria-hidden="true">→</span>
              </Link>
              {user && <Link to="/history" className="btn-secondary">Lịch sử dự đoán</Link>}
            </div>
          </div>
          <div className="rounded-2xl border border-white bg-white/90 p-5 shadow-sm sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">Bản ghi giá mới nhất</p>
                {latest ? (
                  <>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                      {money.format(latest.price)}
                      <span className="ml-2 text-base font-semibold text-slate-500">{latest.unit}</span>
                    </p>
                    <p className="mt-2 text-sm font-semibold text-emerald-800">{latest.variety} · {latest.province}</p>
                  </>
                ) : (
                  <p className="mt-3 text-lg font-semibold text-slate-800">{loading ? 'Đang tải dữ liệu...' : 'Chưa có dữ liệu giá'}</p>
                )}
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Dữ liệu thị trường</span>
            </div>
            {latest && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <span>Cập nhật: {dateTime(latest.observedAt)}</span>
                {latest.source && <span>Nguồn: {latest.source}</span>}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Dữ liệu thị trường</p>
            <h2 className="page-title">Diễn biến giá gần đây</h2>
            {latest && <p className="mt-1 text-sm text-slate-500">{latest.variety} · {latest.province} · {latest.unit}</p>}
          </div>
          {prices.length > 0 && <p className="text-xs text-slate-500">Tối đa 90 mức giá được ghi nhận gần nhất</p>}
        </div>

        {error && <div className="alert-error mb-4" role="alert">{error}</div>}
        {loading ? (
          <div className="page-message">Đang tải dữ liệu giá...</div>
        ) : error ? null : prices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
            <h3 className="font-semibold text-slate-900">Chưa có bản ghi giá nào</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Trang này hiển thị dữ liệu hiện có và không tạo số liệu thay thế.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {chartData.length > 1 && (
              <div className="h-64 rounded-xl bg-slate-50 p-3 sm:h-72 sm:p-5">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="label" minTickGap={28} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value) => money.format(value)} width={72} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(value, _name, entry) => [`${money.format(value)} ${entry.payload.unit || ''}`, entry.payload.variety]} />
                    <Line type="monotone" dataKey="price" stroke="#047857" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Bản ghi giá gần nhất</h3>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
                {prices.slice(0, 6).map((item) => (
                  <article className="flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3" key={item._id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{item.variety} <span className="font-normal text-slate-500">· {item.province}</span></p>
                      <p className="mt-1 text-xs text-slate-500">{dateTime(item.observedAt)}{item.source ? ` · ${item.source}` : ''}</p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-bold text-emerald-800">{money.format(item.price)} <span className="font-medium text-slate-500">{item.unit}</span></p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
