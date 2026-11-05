import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Prediction from './pages/Prediction';
import PredictionDetail from './pages/PredictionDetail';
import History from './pages/History';
import Profile from './pages/Profile';

function AppLayout() {
  const { pathname } = useLocation();
  const authPage = pathname === '/login' || pathname === '/register';

  return (
    <div className="min-h-screen">
      {!authPage && <Navbar />}
      <main className={authPage ? 'min-h-screen' : 'container-page py-6 sm:py-8'}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/predict" element={<Prediction />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:id" element={<PredictionDetail />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<div className="panel text-center">Không tìm thấy trang này.</div>} />
        </Routes>
      </main>
      {!authPage && (
        <footer className="mt-8 border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500">
          Công cụ tham khảo dự đoán giá lúa · Kiểm chứng kết quả với dữ liệu thị trường thực tế.
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  );
}