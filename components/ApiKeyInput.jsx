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
        <input
          type="text"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="API Key"
          className="border border-secondary rounded px-4 py-2 mb-4 w-full text-base focus:outline-none focus:ring-2 focus:ring-primary"
        />
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
