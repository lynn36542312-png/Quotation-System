
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import SalesPage from './pages/SalesPage';
import AdminPage from './pages/AdminPage';
import PmOwnersPage from './pages/PmOwnersPage';
import BrandFilesPage from './pages/BrandFilesPage';

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
  return (
    <Link
      to={to}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:text-blue-600'
      }`}
    >
      {children}
    </Link>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-800">QuoteBot MVP</h1>
            <div className="flex flex-wrap gap-2">
              <NavLink to="/">Sales 前台</NavLink>
              <NavLink to="/admin">PM/Admin 後台</NavLink>
              <NavLink to="/admin/pm-owners">PM 負責品牌</NavLink>
            </div>
          </div>
        </nav>
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<SalesPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/pm-owners" element={<PmOwnersPage />} />
            <Route path="/admin/brands/:brandName" element={<BrandFilesPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
