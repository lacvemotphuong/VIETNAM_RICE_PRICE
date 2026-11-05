import { useEffect, useState } from 'react';
import { getApiError, userApi } from '../api';
import { useAuth } from '../auth/useAuth';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: '', email: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    userApi.me()
      .then(({ data }) => {
        if (!active) return;
        setForm({ name: data.user.name, email: data.user.email });
        updateUser(data.user);
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [updateUser]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await userApi.update(form);
      setForm({ name: data.user.name, email: data.user.email });
      updateUser(data.user);
      setSuccess('Thông tin tài khoản đã được cập nhật.');
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page-message" role="status">Đang tải thông tin tài khoản...</div>;

  const avatarLabel = (form.name || form.email || user?.email || 'U').trim().charAt(0).toLocaleUpperCase('vi');

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-2xl font-bold text-emerald-900">
          {avatarLabel}
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Tài khoản</p>
          <h1 className="mt-1 truncate text-xl font-bold text-slate-900">{form.name || user?.name}</h1>
          <p className="mt-1 truncate text-sm text-slate-500">{form.email || user?.email}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          Vai trò: {user?.role || 'user'}
        </span>
      </div>

      <form className="panel" onSubmit={submit}>
        <div className="mb-5">
          <p className="eyebrow">Thông tin cá nhân</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">Cài đặt tài khoản</h2>
          <p className="mt-1 text-sm text-slate-500">Cập nhật tên hiển thị hoặc email trong tài khoản.</p>
        </div>
        {error && <div className="alert-error mb-4" role="alert">{error}</div>}
        {success && <div className="alert-success mb-4" role="status">{success}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Họ và tên</span>
            <input className="field" autoComplete="name" minLength="2" maxLength="80" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </label>
          <label className="block">
            <span className="field-label">Email</span>
            <input className="field" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
        </div>
        <p className="mt-4 text-xs text-slate-500">Đổi mật khẩu chưa được hỗ trợ trong phiên bản này.</p>
        <button className="btn-primary mt-5" type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </form>
    </section>
  );
}
