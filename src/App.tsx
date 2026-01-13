import React, { useState } from 'react';
import DronePage from './Drone';
import Taipei101Page from './Taipei101';
import KalimbaPage from './Kalimba';
import ViolinPage from './Violin';

export default function App() {
  const [page, setPage] = useState<'drone' | 't101' | 'kalimba' | 'violin'>('drone');

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      
      {/* 頁面內容 */}
      <div style={{ width: '100%', height: '100%' }}>
        {page === 'drone' && <DronePage />}
        {page === 't101' && <Taipei101Page />}
        {page === 'kalimba' && <KalimbaPage />}
        {page === 'violin' && <ViolinPage />}
      </div>

      {/* 導航切換器 (RWD 優化) */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center', // 手機置中，桌面可靠右 (透過樣式調整)
        padding: '15px',
        pointerEvents: 'none', // 讓點擊穿透到 canvas，按鈕自己開啟 pointer-events
      }}>
        <div style={{
          display: 'flex',
          gap: '10px',
          background: 'rgba(0,0,0,0.6)',
          padding: '8px 12px',
          borderRadius: '20px',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'auto',
          maxWidth: '95%',
          overflowX: 'auto', // 手機上可橫向捲動
          whiteSpace: 'nowrap',
          scrollbarWidth: 'none', // Firefox
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
        }}>
          {[
            { id: 'drone', label: '積木無人機', color: '#FF6600' },
            { id: 't101', label: '台北 101', color: '#2E8B57' },
            { id: 'kalimba', label: '電子拇指琴', color: '#00ced1' },
            { id: 'violin', label: '小提琴模擬', color: '#8b4513' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id as any)}
              style={{
                padding: '8px 16px',
                background: page === item.id ? item.color : 'transparent',
                color: page === item.id ? '#fff' : '#ccc',
                border: page === item.id ? `1px solid ${item.color}` : '1px solid rgba(255,255,255,0.2)',
                borderRadius: '16px',
                cursor: 'pointer',
                fontFamily: '"Microsoft JhengHei", sans-serif',
                fontSize: '0.95rem',
                fontWeight: page === item.id ? 'bold' : 'normal',
                transition: 'all 0.2s',
                flexShrink: 0 // 防止按鈕被壓縮
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}