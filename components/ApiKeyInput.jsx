import React, { useState } from 'react';

export default function ApiKeyInput({ onSubmit, onClose }) {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [googleApiKey, setGoogleApiKey] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSubmit) onSubmit({ gemini: geminiApiKey, google: googleApiKey });
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-text-primary bg-opacity-30 z-[999999]">
      <form onSubmit={handleSubmit} className="bg-background rounded-xl shadow-xl p-8 flex flex-col items-center min-w-[320px] relative">
        <button 
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 text-text-secondary hover:text-text-primary text-xl w-6 h-6 flex items-center justify-center"
        >
          &times;
        </button>
        <h2 className="text-xl font-bold mb-6 text-center text-text-primary">API 키를 입력하세요</h2>
        
        <div className="mb-4 w-full">
          <label className="block text-sm font-semibold mb-2 text-text-primary">Gemini API Key</label>
          <input
            type="text"
            value={geminiApiKey}
            onChange={e => setGeminiApiKey(e.target.value)}
            placeholder="Gemini API Key"
            className="border border-secondary rounded px-4 py-2 w-full text-base focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="mb-4 w-full">
          <label className="block text-sm font-semibold mb-2 text-text-primary">Google Search API Key</label>
          <input
            type="text"
            value={googleApiKey}
            onChange={e => setGoogleApiKey(e.target.value)}
            placeholder="Google Custom Search API Key"
            className="border border-secondary rounded px-4 py-2 w-full text-base focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-text-secondary mt-1">유사 기사 찾기, 사실 검증 기능에 사용됩니다.</p>
        </div>

        <button
          type="submit"
          className="bg-primary text-text-primary px-6 py-2 rounded font-semibold hover:bg-secondary transition-colors w-full"
        >
          확인
        </button>
      </form>
    </div>
  );
}
