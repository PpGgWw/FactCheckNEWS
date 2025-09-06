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
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200', 
          titleColor: 'text-green-700'
        };
      } else if (this.content.includes('가짜')) {
        return {
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          titleColor: 'text-red-700'
        };
      }
    }
    
    return {
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      titleColor: 'text-gray-700'
    };
  }

  render() {
    if (!this.content) return '';
    
    const style = this.getBackgroundStyle();
    
    return `
      <div class="mb-4 p-4 ${style.bgColor} border ${style.borderColor} rounded-lg">
        <h3 class="font-semibold text-sm ${style.titleColor} mb-2">${this.title}</h3>
        <div class="text-sm text-gray-800 leading-relaxed">${this.content}</div>
      </div>
    `;
  }
}

// Export for use in content_script.js
window.AnalysisBlock = AnalysisBlock;
