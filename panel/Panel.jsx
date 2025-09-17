import React, { useState, useEffect } from 'react';

export default function Panel() {
  const [hasResults, setHasResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="w-full h-full flex flex-col bg-background">
      {/* Modern Header with Gradient */}
      <div className="bg-gradient-primary p-6 border-b border-border-light">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-text-primary mb-1">
              뉴스 팩트체크 분석
            </h2>
            <p className="text-sm text-text-secondary">
              AI 기반 실시간 뉴스 신뢰도 검증
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-status-success rounded-full animate-pulse"></div>
            <span className="text-xs text-text-secondary">연결됨</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          /* Loading State */
          <div className="h-full flex flex-col items-center justify-center p-6">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              분석 중...
            </h3>
            <p className="text-sm text-text-secondary text-center max-w-xs">
              뉴스 내용을 검토하고 신뢰도를 분석하고 있습니다.
            </p>
          </div>
        ) : hasResults ? (
          /* Results Display */
          <div className="h-full overflow-y-auto p-6 space-y-4">
            {/* Analysis Results Container */}
            <div className="card p-6">
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-status-success rounded-full flex items-center justify-center mr-3">
                  <span className="text-white text-sm font-bold">✓</span>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">분석 완료</h3>
                  <p className="text-xs text-text-secondary">신뢰도 검증 결과</p>
                </div>
              </div>
              
              {/* Sample Result Card */}
              <div className="card-success mb-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-status-success rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-xs">i</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-status-success-dark mb-1">
                      신뢰할 수 있는 뉴스
                    </h4>
                    <p className="text-sm text-text-primary">
                      검증된 출처와 사실 기반의 정보가 확인되었습니다.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 mt-6">
                <button className="btn-primary flex-1">
                  상세 보기
                </button>
                <button className="btn-secondary">
                  공유하기
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="h-full flex flex-col items-center justify-center p-6">
            <div className="w-24 h-24 bg-primary-light rounded-full flex items-center justify-center mb-6">
              <span className="text-4xl">📰</span>
            </div>
            
            <h3 className="text-xl font-semibold text-text-primary mb-3">
              분석할 뉴스를 선택하세요
            </h3>
            
            <p className="text-sm text-text-secondary text-center max-w-xs mb-6">
              웹페이지의 뉴스 기사를 선택하면 AI가 자동으로 신뢰도를 분석해드립니다.
            </p>
            
            <div className="w-full max-w-xs space-y-3">
              <div className="flex items-center p-3 bg-surface-hover rounded-xl border border-border-light">
                <div className="w-2 h-2 bg-status-info rounded-full mr-3"></div>
                <span className="text-xs text-text-secondary">출처 검증</span>
              </div>
              
              <div className="flex items-center p-3 bg-surface-hover rounded-xl border border-border-light">
                <div className="w-2 h-2 bg-status-warning rounded-full mr-3"></div>
                <span className="text-xs text-text-secondary">팩트 체크</span>
              </div>
              
              <div className="flex items-center p-3 bg-surface-hover rounded-xl border border-border-light">
                <div className="w-2 h-2 bg-status-success rounded-full mr-3"></div>
                <span className="text-xs text-text-secondary">신뢰도 평가</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border-light p-4 bg-surface">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>FactCheck AI v1.0</span>
          <div className="flex items-center space-x-4">
            <button className="hover:text-text-secondary transition-colors">
              설정
            </button>
            <button className="hover:text-text-secondary transition-colors">
              도움말
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
