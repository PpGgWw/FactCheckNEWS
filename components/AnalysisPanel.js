// AnalysisPanel.js - 분석 결과 패널 컴포넌트

class AnalysisPanel {
  constructor() {
    this.panelId = 'news-analysis-panel';
  }

  create() {
    // 기존 패널이 있으면 제거
    const existingPanel = document.getElementById(this.panelId);
    if (existingPanel) {
      existingPanel.remove();
    }

    // 패널 컨테이너 생성
    const panelContainer = document.createElement('div');
    panelContainer.id = this.panelId;
    panelContainer.className = 'fixed bottom-1 right-1 w-96 max-h-96 bg-white shadow-2xl z-50 overflow-y-auto rounded-xl border border-gray-200';
    
    // 애니메이션 효과 추가
    panelContainer.style.cssText += `
      transform: translateX(100%);
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
      opacity: 0;
    `;
    
    document.body.appendChild(panelContainer);
    
    // 애니메이션 시작
    setTimeout(() => {
      panelContainer.style.transform = 'translateX(0)';
      panelContainer.style.opacity = '1';
    }, 10);
    
    return panelContainer;
  }

  renderHeader() {
    return `
      <div class="flex justify-between items-center mb-4 pb-3 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 -m-4 p-4 rounded-t-xl">
        <h2 class="text-lg font-bold text-gray-800">🔍 뉴스 분석</h2>
        <button id="close-panel" class="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors">&times;</button>
      </div>
    `;
  }

  renderError() {
    return `
      <div class="p-6">
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <div class="text-red-700 font-medium">분석 결과가 없습니다</div>
        </div>
      </div>
    `;
  }

  attachCloseEvent(panel) {
    const closeBtn = panel.querySelector('#close-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // 닫기 애니메이션
        panel.style.transform = 'translateX(100%)';
        panel.style.opacity = '0';
        setTimeout(() => {
          panel.remove();
        }, 300);
      });
    }
  }
}

// Export for use in content_script.js
window.AnalysisPanel = AnalysisPanel;
