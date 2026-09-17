import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import DataOrchestrator from './pages/DataOrchestrator';
import KnowledgeSources from './pages/KnowledgeSources';
import NetworkExplorer from './pages/NetworkExplorer';
import LLMBackends from './pages/LLMBackends';
import MCPPersonality from './pages/MCPPersonality';
import Jobs from './pages/Jobs';
import Users from './pages/Users';
import { useAuthStore } from './store/authStore';

function ProtectedRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && !isAdmin()) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="chat" element={<Chat />} />
          <Route path="orchestrator" element={<DataOrchestrator />} />
          <Route path="knowledge" element={<KnowledgeSources />} />
          <Route path="network" element={<NetworkExplorer />} />
          <Route path="llm-backends" element={<LLMBackends />} />
          <Route path="personality" element={<MCPPersonality />} />
          <Route path="jobs" element={<Jobs />} />
          <Route
            path="users"
            element={
              <ProtectedRoute adminOnly>
                <Users />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
