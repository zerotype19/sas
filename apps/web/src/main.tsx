import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './index.css';
import IBKRDashboard from './pages/IBKRDashboard';
import Dashboard from './pages/Dashboard';
import Proposals from './pages/Proposals';
import ProposalsRich from './pages/ProposalsRich';
import Positions from './pages/Positions';
import PositionDetail from './pages/PositionDetail';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold">SAS</h1>
              <div className="flex space-x-4">
                <Link to="/" className="text-gray-700 hover:text-gray-900">Dashboard</Link>
                <Link to="/proposals" className="text-gray-700 hover:text-gray-900">Proposals</Link>
                <Link to="/positions" className="text-gray-700 hover:text-gray-900">Positions</Link>
              </div>
            </div>
          </div>
        </nav>
        
        <main className="max-w-7xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<IBKRDashboard />} />
            <Route path="/old-dashboard" element={<Dashboard />} />
            <Route path="/proposals" element={<ProposalsRich />} />
            <Route path="/proposals-old" element={<Proposals />} />
            <Route path="/positions" element={<Positions />} />
            <Route path="/positions/:id" element={<PositionDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

