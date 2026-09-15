import { create } from 'zustand';
import api from '../api/client';

const getStoredUser = () => {
  try {
    const item = localStorage.getItem('user_profile');
    if (!item || item === 'undefined' || item === 'null') return null;
    return JSON.parse(item);
  } catch (e) {
    localStorage.removeItem('user_profile');
    return null;
  }
};

export const useAuthStore = create((set, get) => ({
  user: getStoredUser(),
  token: localStorage.getItem('access_token') || null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await api.post('/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const { access_token, refresh_token, user } = res.data;

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user_profile', JSON.stringify(user));

      set({
        token: access_token,
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });
      return true;
    } catch (err) {
      const msg = err.response?.data?.detail || 'Invalid username or password';
      set({ error: msg, isLoading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_profile');
    set({ user: null, token: null, isAuthenticated: false });
  },

  isAdmin: () => {
    const user = get().user;
    return user && user.role === 'admin';
  }
}));
