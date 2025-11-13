import React, { useState } from 'react';

export default function ApiKeyInput({ onSubmit, onClose }) {
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) onSubmit(apiKey);
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-modal z-[999999] animate-fade-in">
      <form 
        onSubmit={handleSubmit} 
        className="bg-background rounded-2xl shadow-strong p-8 flex flex-col items-center min-w-[360px] max-w-md w-full mx-4 relative animate-slide-up border border-border"
      >
        <button 
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-text-secondary hover:text-text-primary text-2xl w-8 h-8 flex items-center justify-center transition-all duration-fast hover:scale-110 hover:bg-surface-hover rounded-lg"
          aria-label="닫기"
        >
          &times;
        </button>
        
        <div className="w-16 h-16 bg-gradient-panel-header rounded-2xl flex items-center justify-center mb-6 shadow-medium">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        
        <h2 className="text-2xl font-bold mb-2 text-center text-text-primary">API 키 입력</h2>
        <p className="text-sm text-text-muted text-center mb-6">Gemini API 키를 입력하여 팩트체크를 시작하세요</p>
        
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="API Key를 입력하세요"
          className="input-field mb-6 w-full"
          autoFocus
        />
        
        <button
          type="submit"
          className="btn-primary w-full text-base font-semibold py-3"
        >
          확인
        </button>
        
        <p className="text-xs text-text-muted text-center mt-4 leading-relaxed">
          API 키는 암호화되어 안전하게 저장됩니다
        </p>
      </form>
    </div>
  );
}
