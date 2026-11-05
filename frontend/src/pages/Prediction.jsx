import { useState } from 'react';
import { Link } from 'react-router-dom';
import PredictionForm from '../components/PredictionForm';
import PredictionResult from '../components/PredictionResult';

export default function Prediction() {
  const [result, setResult] = useState(null);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-3xl border border-emerald-100 bg-gradient-to-r from-white to-emerald-50 p-6 sm:p-8">
        <p className="eyebrow">Dự báo giá lúa</p>
        <h1 className="page-title">Tạo dự đoán</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Chọn sản phẩm, khu vực, mô hình và khoảng thời gian để dự báo giá theo tháng. Kết quả được lưu vào lịch sử tài khoản.
        </p>
      </section>
      <PredictionForm onComplete={setResult} />
      <PredictionResult prediction={result} />
      {result && (
        <Link to="/history" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:text-emerald-950">
          Mở lịch sử dự đoán <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}
