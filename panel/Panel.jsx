import React from 'react';

export default function Panel() {
  return (
    <div className="w-full h-full flex flex-col bg-white p-4">
      <h2 className="text-lg font-bold mb-2">Gemini 뉴스 분석 결과</h2>
      <div className="flex-1 overflow-y-auto border rounded p-2 bg-gray-50">
        {/* Gemini 결과가 여기에 표시됩니다 */}
        <div className="text-gray-400 text-center mt-8">아직 결과가 없습니다.</div>
      </div>
      <div className="mt-4 text-xs text-gray-400 text-center">Powered by Gemini API</div>
    </div>
  );
}
