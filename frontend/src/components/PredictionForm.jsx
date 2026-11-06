import { useEffect, useMemo, useState } from 'react';
import { getApiError, predictionsApi } from '../api';

const modelOrder = ['random_forest', 'xgboost'];
const modelLabels = { random_forest: 'Random Forest', xgboost: 'XGBoost' };
const modelDescriptions = {
  random_forest: 'Dựa trên dữ liệu giá lịch sử của sản phẩm và khu vực bạn chọn.',
  xgboost: 'Dựa trên lịch sử giá của sản phẩm và khu vực bạn chọn.',
};

function getSeriesHorizons(series, model) {
  return series?.horizons_days_by_model?.[model] || series?.horizons_days || [];
}

function SectionIcon({ type }) {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700" aria-hidden="true">
      {type === 'model' ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 5h16M7 12h10m-7 7h4" />
          <circle cx="8" cy="5" r="1.5" fill="currentColor" />
          <circle cx="15" cy="12" r="1.5" fill="currentColor" />
          <circle cx="11" cy="19" r="1.5" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}

export default function PredictionForm({ onComplete }) {
  const [models, setModels] = useState({});
  const [options, setOptions] = useState(null);
  const [unitConfigured, setUnitConfigured] = useState(false);
  const [selected, setSelected] = useState('');
  const [product, setProduct] = useState('');
  const [location, setLocation] = useState('');
  const [horizonDays, setHorizonDays] = useState(1);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [optionsError, setOptionsError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    predictionsApi.models()
      .then(({ data }) => {
        const availableModels = data.models && typeof data.models === 'object' ? data.models : {};
        setModels(availableModels);
        setUnitConfigured(data.price_unit_configured === true);
        setSelected(modelOrder.find((name) => availableModels[name]?.available) || '');
      })
      .catch((requestError) => setModelsError(getApiError(requestError)))
      .finally(() => setLoadingModels(false));

    predictionsApi.options()
      .then(({ data }) => {
        const availableSeries = Array.isArray(data.series) ? data.series : [];
        setOptions({ ...data, series: availableSeries });
        if (availableSeries.length) {
          setProduct(availableSeries[0].product);
          setLocation(availableSeries[0].location);
        }
      })
      .catch((requestError) => setOptionsError(getApiError(requestError)))
      .finally(() => setLoadingOptions(false));
  }, []);

  const current = models[selected] || {};
  const series = options?.series || [];
  const products = useMemo(() => [...new Set(series.map((item) => item.product))], [series]);
  const locations = useMemo(
    () => series.filter((item) => item.product === product),
    [product, series]
  );
  const selectedSeries = locations.find((item) => item.location === location);
  const availableModels = (selectedSeries?.models || []).filter(
    (name) => getSeriesHorizons(selectedSeries, name).length > 0
  );
  const modelReady = current.available === true;
  const selectedModelReady = modelReady && availableModels.includes(selected);
  const targetUnit = options?.unit || (unitConfigured ? 'đơn vị đã cấu hình' : '');
  const horizons = getSeriesHorizons(selectedSeries, selected);

  useEffect(() => {
    if (selected && availableModels.includes(selected)) return;
    setSelected(modelOrder.find((name) => availableModels.includes(name)) || '');
  }, [availableModels, selected]);

  useEffect(() => {
    if (horizons.length && !horizons.includes(horizonDays)) {
      setHorizonDays(horizons[0]);
    }
  }, [horizonDays, horizons]);

  function changeProduct(value) {
    setProduct(value);
    const matchingSeries = series.filter((item) => item.product === value);
    const nextSeries = matchingSeries[0];
    setLocation(nextSeries?.location || '');
    const nextHorizons = getSeriesHorizons(nextSeries, selected);
    if (!nextHorizons.includes(horizonDays)) {
      setHorizonDays(nextHorizons[0] || 1);
    }
    setError('');
  }

  function changeLocation(value) {
    setLocation(value);
    const nextSeries = locations.find((item) => item.location === value);
    const nextHorizons = getSeriesHorizons(nextSeries, selected);
    if (!nextHorizons.includes(horizonDays)) {
      setHorizonDays(nextHorizons[0] || 1);
    }
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!selectedModelReady || !unitConfigured) return;
    if (!selectedSeries) {
      setError('Vui lòng chọn sản phẩm và khu vực có đủ dữ liệu để dự báo.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await predictionsApi.create({
        model: selected,
        product,
        location,
        horizon_days: horizonDays,
      });
      onComplete(data.prediction);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingModels || loadingOptions) {
    return <div className="page-message" role="status">Đang tải các lựa chọn dự báo...</div>;
  }
  if (modelsError && !Object.keys(models).length) {
    return <div className="alert-error" role="alert">{modelsError}</div>;
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <section className="panel">
        <div className="mb-5 flex items-center gap-3 border-b border-slate-100 pb-4">
          <SectionIcon type="input" />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Thông số dự đoán</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Lịch sử giá đã lưu · {targetUnit || 'đơn vị giá chưa cấu hình'}
            </p>
          </div>
        </div>

        {!unitConfigured && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900" role="alert">
            Chưa cấu hình được đơn vị giá cho hệ thống. Vui lòng liên hệ quản trị viên.
          </p>
        )}
        {optionsError && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900" role="alert">
            Không tải được danh sách sản phẩm/khu vực: {optionsError}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="field-label">Sản phẩm</span>
            <select className="field" value={product} onChange={(event) => changeProduct(event.target.value)} disabled={!products.length}>
              {products.length
                ? products.map((item) => <option key={item} value={item}>{item}</option>)
                : <option value="">Không có sản phẩm đủ dữ liệu</option>}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Khu vực / Tỉnh thành</span>
            <select className="field" value={location} onChange={(event) => changeLocation(event.target.value)} disabled={!locations.length}>
              {locations.length
                ? locations.map((item) => <option key={`${item.product}-${item.location}`} value={item.location}>{item.location}</option>)
                : <option value="">Không có khu vực phù hợp</option>}
            </select>
            {selectedSeries && (
              <span className="mt-1 block text-xs text-slate-500">
                Ngày dự báo gần nhất: {selectedSeries.forecast_anchor_date}
                {' · '}CSV mới nhất: {selectedSeries.latest_csv_date}
                {' · '}Chuỗi giá đến: {selectedSeries.series_latest_date}
                {' · '}{selectedSeries.history_months} tháng có giá
              </span>
            )}
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="field-label">Số ngày dự báo</legend>
          <div className="grid grid-cols-3 gap-2">
            {horizons.map((days) => (
              <label
                className={`flex cursor-pointer flex-col items-center rounded-xl border px-3 py-3 text-center transition ${
                  horizonDays === days ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                key={days}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="horizon-days"
                  value={days}
                  checked={horizonDays === days}
                  onChange={() => setHorizonDays(days)}
                />
                <span className="text-sm font-bold text-slate-800">{days} ngày</span>
                <span className="mt-0.5 text-[11px] text-slate-500">
                  {days === 1 ? 'Ngày kế tiếp' : `Tới ${days} ngày kế tiếp`}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Dự báo tính từ ngày mai theo ngày hiện tại tại Việt Nam. Hệ thống ngoại suy tuần tự từ giá thực cuối cùng trong CSV; không tạo hay ghi thêm dữ liệu.
          </p>
        </fieldset>
      </section>

      <section className="panel">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <SectionIcon type="model" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Chọn cách dự báo</h2>
              <p className="mt-0.5 text-xs text-slate-500">{availableModels.length} / 2 mô hình phù hợp lựa chọn này</p>
            </div>
          </div>
          <span className="hidden text-[10px] font-semibold text-slate-400 sm:block">Chọn phương án phù hợp</span>
        </div>

        <div className="space-y-2.5">
          {modelOrder.map((name) => {
            const info = models[name];
            if (!info) return null;
            const active = selected === name;
            const modelAvailableForSeries = info.available && availableModels.includes(name);
            return (
              <label
                key={name}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                  active ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white hover:border-emerald-200'
                } ${!modelAvailableForSeries ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  className="mt-1 accent-emerald-600"
                  type="radio"
                  name="prediction-model"
                  value={name}
                  checked={active}
                  disabled={!modelAvailableForSeries}
                  onChange={() => {
                    setSelected(name);
                    const modelHorizons = getSeriesHorizons(selectedSeries, name);
                    if (!modelHorizons.includes(horizonDays)) {
                      setHorizonDays(modelHorizons[0] || 1);
                    }
                    setError('');
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900">{modelLabels[name]}</span>
                    <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                        modelAvailableForSeries ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                    }`}>
                        {modelAvailableForSeries ? 'Sẵn sàng' : 'Chưa sẵn sàng'}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{modelDescriptions[name]}</span>
                  {!info.available && info.reason && <span className="mt-1 block text-xs leading-5 text-amber-700">{info.reason}</span>}
                    {info.available && !availableModels.includes(name) && (
                      <span className="mt-1 block text-xs leading-5 text-amber-700">Model chưa được huấn luyện cho chuỗi này.</span>
                    )}
                </span>
              </label>
            );
          })}
        </div>

        {modelsError && <div className="alert-error mt-4" role="alert">{modelsError}</div>}
        {error && <div className="alert-error mt-4" role="alert">{error}</div>}
        <button
          className="btn-primary mt-4 w-full !bg-emerald-500 hover:!bg-emerald-600"
          type="submit"
          disabled={submitting || !selectedModelReady || !unitConfigured || !selectedSeries || Boolean(optionsError)}
        >
          {submitting ? 'Đang ngoại suy dữ liệu và tính toán...' : '▶  Thực hiện dự đoán ngay'}
        </button>
      </section>
    </form>
  );
}
