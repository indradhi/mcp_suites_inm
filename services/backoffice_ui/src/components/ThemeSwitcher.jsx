import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('app-theme') || 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    localStorage.setItem('app-theme', theme);
    
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  return (
    <div className="join bg-base-200 p-1 rounded-lg">
      <button 
        className={`join-item btn btn-sm border-none ${theme === 'light' ? 'btn-active' : 'bg-transparent shadow-none'}`} 
        onClick={() => setTheme('light')}
        title="Light Theme"
      >
        <Sun size={14} />
      </button>
      <button 
        className={`join-item btn btn-sm border-none ${theme === 'system' ? 'btn-active' : 'bg-transparent shadow-none'}`} 
        onClick={() => setTheme('system')}
        title="System Theme"
      >
        <Monitor size={14} />
      </button>
      <button 
        className={`join-item btn btn-sm border-none ${theme === 'dark' ? 'btn-active' : 'bg-transparent shadow-none'}`} 
        onClick={() => setTheme('dark')}
        title="Dark Theme"
      >
        <Moon size={14} />
      </button>
    </div>
  );
}
