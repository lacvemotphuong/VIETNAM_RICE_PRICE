import { Link, NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../auth/useAuth';

const linkClass = ({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <nav className="container-page flex min-h-[68px] flex-wrap items-center justify-between gap-3 py-3" aria-label="Điều hướng chính">
        <Link to="/" className="flex items-center gap-3" onClick={closeMenu}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-800 text-emerald-100 shadow-sm" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M20 4c-8 0-14 3.4-14 10a6 6 0 0 0 6 6c6.6 0 8-8 8-16Z" />
              <path d="M4 21c2.4-4.4 5.7-7.5 10-10" />
            </svg>
          </span>
          <span>
            <span className="block text-sm font-extrabold tracking-tight text-slate-900">VIETNAM RICE PRICE</span>
            <span className="block text-xs text-slate-500">Lịch sử & dự báo giá lúa gạo</span>
          </span>
        </Link>
        <button
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 md:hidden"
          type="button"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Đóng điều hướng' : 'Mở điều hướng'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? 'Đóng' : 'Menu'}
        </button>
        <div className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-1 rounded-xl bg-slate-50 p-2 md:flex md:w-auto md:flex-row md:items-center md:bg-transparent md:p-0`}>
          <NavLink to="/" end className={linkClass} onClick={closeMenu}>Trang chủ</NavLink>
          {user ? (
            <>
              <NavLink to="/predict" className={linkClass} onClick={closeMenu}>Dự đoán</NavLink>
              <NavLink to="/history" className={linkClass} onClick={closeMenu}>Lịch sử</NavLink>
              <NavLink to="/profile" className={linkClass} onClick={closeMenu}>Tài khoản</NavLink>
              <button type="button" className="btn-secondary !px-4 !py-2" onClick={() => { logout(); closeMenu(); }}>Đăng xuất</button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={linkClass} onClick={closeMenu}>Đăng nhập</NavLink>
              <Link to="/register" className="btn-primary !px-4 !py-2" onClick={closeMenu}>Tạo tài khoản</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}