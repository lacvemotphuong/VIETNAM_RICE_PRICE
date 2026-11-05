import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import AuthBrand from '../components/AuthBrand';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/predict" replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      navigate('/predict', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-emerald-50/60 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <AuthBrand />
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Tạo tài khoản mới</h1>
          <p className="mt-1 text-sm text-slate-500">Theo dõi và dự báo giá lúa</p>
        </div>
        <form className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7" onSubmit={submit}>
          <label className="mb-4 block">
            <span className="field-label">Họ và tên</span>
            <input className="field" autoComplete="name" minLength="2" maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="mb-4 block">
            <span className="field-label">Email</span>
            <input className="field" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label className="mb-5 block">
            <span className="field-label">Mật khẩu <span className="font-normal text-slate-400">(ít nhất 8 ký tự)</span></span>
            <input className="field" type="password" autoComplete="new-password" minLength="8" maxLength="128" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          </label>
          {error && <div className="alert-error mb-4" role="alert">{error}</div>}
          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            {submitting ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký'}
          </button>
          <p className="mt-5 text-center text-sm text-slate-600">
            Đã có tài khoản? <Link className="font-semibold text-emerald-800 hover:underline" to="/login">Đăng nhập</Link>
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">VIETNAM RICE PRICE · Bảo mật & tin cậy</p>
      </div>
    </section>
  );
}
