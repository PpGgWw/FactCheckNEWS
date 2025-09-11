// AnalysisBlock.js - 분석 결과 블록 컴포넌트

class AnalysisBlock {
  constructor(title, content, type = 'default') {
    this.title = title;
    this.content = content;
    this.type = type;
  }

  getBackgroundStyle() {
    if (this.type === 'verdict') {
      if (this.content.includes('진짜')) {
        return {
          bgColor: 'bg-status-success-light',
          borderColor: 'border-status-success',
          titleColor: 'text-status-success'
        };
      } else if (this.content.includes('가짜')) {
        return {
          bgColor: 'bg-status-error-light',
          borderColor: 'border-status-error',
          titleColor: 'text-status-error'
        };
      }
    }
    
    return {
      bgColor: 'bg-container-and-border',
      borderColor: 'border-container-and-border',
      titleColor: 'text-title'
    };
  }

  render() {
    if (!this.content) return '';
    
    const style = this.getBackgroundStyle();
    
    return `
      <div class="mb-4 p-4 ${style.bgColor} border ${style.borderColor} rounded-lg">
    <h3 class="font-semibold text-lg ${style.titleColor} mb-2">${this.title}</h3>
    <div class="text-lg text-text-main leading-relaxed">${this.content}</div>
      </div>
    `;
  }
}

// Export for use in content_script.js
window.AnalysisBlock = AnalysisBlock;
