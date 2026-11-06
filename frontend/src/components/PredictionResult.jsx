import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const numberFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const modelLabels = {
  ann: 'ANN',
  lstm: 'LSTM',
  sarimax: 'SARIMAX',
  random_forest: 'Random Forest',
  xgboost: 'XGBoost',
};
const dateTime = (value) => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : null;

function nextMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(month) {
  const [, monthNumber] = month.split('-');
  return `${monthNumber}/${month.slice(0, 4)}`;
}

function formatDay(day) {
  if (!day) return null;
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

export default function PredictionResult({ prediction }) {
  if (!prediction || !Array.isArray(prediction.predictions) || prediction.predictions.length === 0) return null;

  const actualHistory = Array.isArray(prediction.actualHistory) ? prediction.actualHistory : [];
  const hasActualHistory = actualHistory.some((item) => Number.isFinite(item.price));
  const isMonthly = Boolean(prediction.input?.horizon_months);
  const isDaily = Boolean(prediction.input?.horizon_days);
  const showActualHistory = hasActualHistory && !isDaily;
  const forecastMonths = Array.isArray(prediction.input?.forecast_months)
    ? prediction.input.forecast_months
    : null;
  const forecastDates = Array.isArray(prediction.input?.forecast_dates)
    ? prediction.input.forecast_dates
    : null;
  const latestActual = [...actualHistory].reverse().find((item) => Number.isFinite(item.price));
  const historyRows = actualHistory.map((item) => ({
    label: formatMonth(item.month),
    actualPrice: item.price,
    forecastPrice: null,
  }));

  if (hasActualHistory && latestActual) {
    const anchor = historyRows.find((item) => item.label === formatMonth(latestActual.month));
    if (anchor) anchor.forecastPrice = latestActual.price;
  }

  const forecastRows = prediction.predictions.map((price, index) => ({
    month: forecastMonths?.[index] || (isMonthly && latestActual ? nextMonth(latestActual.month, index + 1) : null),
    label: isDaily
      ? formatDay(forecastDates?.[index])
      : forecastMonths?.[index]
        ? formatMonth(forecastMonths[index])
        : isMonthly && latestActual
          ? formatMonth(nextMonth(latestActual.month, index + 1))
          : isMonthly
            ? `Tháng ${index + 1}`
            : `${index + 1}`,
    actualPrice: null,
    forecastPrice: price,
    step: index + 1,
  }));
  const chartRows = showActualHistory ? [...historyRows, ...forecastRows] : forecastRows;
  const dateLabel = dateTime(prediction.generatedAt || prediction.createdAt);

  return (
    <section className="panel" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">
            Kết quả dự báo{modelLabels[prediction.model?.toLowerCase()]
              ? ` · ${modelLabels[prediction.model.toLowerCase()]}`
              : ''}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            {numberFormat.format(prediction.predictions[0])}
            <span className="ml-2 text-base font-semibold text-slate-500">{prediction.unit}</span>
          </h2>
          {prediction.input?.target && (
            <p className="mt-2 text-sm font-medium text-slate-600">{prediction.input.target}</p>
          )}
          {!prediction.input?.target && prediction.input?.product && prediction.input?.location && (
            <p className="mt-2 text-sm font-medium text-slate-600">
              {prediction.input.product} · {prediction.input.location}
            </p>
          )}
          {isDaily && (
            <p className="mt-1 text-xs text-slate-500">
              Dự báo {prediction.input.horizon_days} ngày kể từ {formatDay(prediction.input.forecast_anchor_date)}
            </p>
          )}
          {isMonthly && (
            <p className="mt-1 text-xs text-slate-500">Kỳ hạn: {prediction.input.horizon_months} tháng</p>
          )}
          {prediction.input?.forecast_anchor_date && (
            <p className="mt-1 text-xs text-slate-500">
              Ngày mốc dự báo: {formatDay(prediction.input.forecast_anchor_date)}
              {prediction.input.latest_csv_date && ` · CSV mới nhất: ${formatDay(prediction.input.latest_csv_date)}`}
              {prediction.input.series_latest_date && ` · Chuỗi giá thực mới nhất: ${formatDay(prediction.input.series_latest_date)}`}
            </p>
          )}
          {dateLabel && <p className="mt-1 text-xs text-slate-500">Thời điểm: {dateLabel}</p>}
        </div>
      </div>

      {showActualHistory && (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-600">
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-4 rounded bg-slate-800" />
            Giá thực tế
          </span>
          <span className="inline-flex items-center gap-2 text-emerald-700">
            <span className="h-0.5 w-4 rounded bg-emerald-600" />
            Giá dự đoán
          </span>
        </div>
      )}

      {showActualHistory && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Giá thực tế lấy từ dữ liệu lịch sử đã có; giá dự báo bắt đầu từ ngày kế tiếp ngày mốc.
        </p>
      )}
      {isDaily && prediction.input?.series_latest_date && prediction.input?.forecast_anchor_date && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Giá thực tế cuối cùng của chuỗi là {formatDay(prediction.input.series_latest_date)}. Các ngày từ sau ngày này đến mốc {formatDay(prediction.input.forecast_anchor_date)} được ngoại suy bằng model, không phải giá thực tế.
        </p>
      )}
      {!hasActualHistory && !isDaily && prediction.input?.target && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Không có dữ liệu lịch sử để so sánh cho chuỗi giá này.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">
          {showActualHistory ? 'So sánh giá thực tế và dự báo' : isDaily ? 'Giá dự báo theo ngày' : 'Giá dự báo theo tháng'}
        </h3>
        <span className="text-xs text-slate-500">Đơn vị: {prediction.unit}</span>
      </div>
      <div
        className="mt-4 h-64 rounded-xl bg-slate-50 p-3 sm:p-5"
        role="img"
        aria-label={showActualHistory ? 'Biểu đồ giá thực tế và giá dự đoán' : 'Biểu đồ giá dự đoán'}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(value) => numberFormat.format(value)} width={72} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value, name) => [
                `${numberFormat.format(value)} ${prediction.unit}`,
                name === 'actualPrice' ? 'Giá thực tế' : 'Giá dự đoán',
              ]}
              labelFormatter={(value) => isMonthly ? value : isDaily ? `Ngày ${value}` : `Bước ${value}`}
            />
            {showActualHistory && (
              <Line type="monotone" dataKey="actualPrice" name="Giá thực tế" stroke="#172033" strokeWidth={2.5} dot={{ r: 3, fill: '#172033' }} connectNulls={false} />
            )}
            <Line
              type="monotone"
              dataKey="forecastPrice"
              name="Giá dự đoán"
              stroke="#059669"
              strokeWidth={2.5}
              strokeDasharray={showActualHistory ? '6 4' : undefined}
              dot={{ r: 3, fill: '#059669' }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full min-w-[280px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">{isDaily ? 'Ngày dự báo' : isMonthly ? 'Tháng dự báo' : 'Bước'}</th>
              <th className="px-4 py-3 text-right font-semibold">Giá dự đoán</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {forecastRows.map(({ label, month, forecastPrice, step }) => (
              <tr key={step}>
                <td className="px-4 py-3 text-slate-600">
                  {isDaily ? label : isMonthly && month ? `Tháng ${month.slice(5, 7)}/${month.slice(0, 4)}` : isMonthly ? label : step}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{numberFormat.format(forecastPrice)} {prediction.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
