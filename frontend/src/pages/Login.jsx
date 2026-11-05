import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import AuthBrand from '../components/AuthBrand';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/predict" replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form);
      navigate(location.state?.from?.pathname || '/predict', { replace: true });
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
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Chào mừng trở lại</h1>
          <p className="mt-1 text-sm text-slate-500">Đăng nhập để tiếp tục sử dụng dự báo giá lúa</p>
        </div>
        <form className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7" onSubmit={submit}>
          <label className="mb-4 block">
            <span className="field-label">Email</span>
            <input className="field" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          <label className="mb-5 block">
            <span className="field-label">Mật khẩu</span>
            <input className="field" type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          </label>
          {error && <div className="alert-error mb-4" role="alert">{error}</div>}
          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
          <p className="mt-5 text-center text-sm text-slate-600">
            Chưa có tài khoản? <Link className="font-semibold text-emerald-800 hover:underline" to="/register">Đăng ký</Link>
          </p>
        </form>
        <p className="mt-4 text-center text-xs text-slate-500">VIETNAM RICE PRICE · Dữ liệu và dự báo theo cấu hình dịch vụ</p>
      </div>
    </section>
  );
}
