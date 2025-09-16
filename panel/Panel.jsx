import React from 'react';

export default function Panel() {
  return (
    <div className="w-full h-full flex flex-col bg-background text-text-primary p-4">
      <h2 className="text-lg font-bold mb-2 text-text-primary">Gemini 뉴스 분석 결과</h2>
      <div className="flex-1 overflow-y-auto border border-secondary rounded p-2 bg-secondary">
        {/* Gemini 결과가 여기에 표시됩니다 */}
        <div className="text-text-secondary text-center mt-8">아직 결과가 없습니다.</div>
      </div>
    </div>
  );
}
