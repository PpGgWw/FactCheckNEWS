// AnalysisDetailBlock.js - 상세 분석 전용 블록

class AnalysisDetailBlock {
  constructor(content) {
    this.content = content;
  }

  render() {
    if (!this.content) return '';
    
    return `
      <div class="mb-3 p-3 bg-accent-light border border-accent rounded-lg shadow-sm">
        <div class="flex items-center mb-2">
          <span class="text-base mr-2">🔍</span>
          <h3 class="font-semibold text-lg text-accent">상세 분석</h3>
        </div>
        <div class="text-lg text-text-main leading-relaxed">${this.content}</div>
      </div>
    `;
  }
}

// Export for use in content_script.js
window.AnalysisDetailBlock = AnalysisDetailBlock;
