// VerdictBlock.js - 진위 판단 전용 블록

class VerdictBlock {
  constructor(content) {
    this.content = content;
  }

  getVerdictStyle() {
    if (this.content.includes('진짜')) {
      return {
        bgColor: 'bg-status-success-light',
        borderColor: 'border-status-success',
        titleColor: 'text-status-success',
        icon: '✓'
      };
    } else if (this.content.includes('가짜')) {
      return {
        bgColor: 'bg-status-error-light',
        borderColor: 'border-status-error',
        titleColor: 'text-status-error',
        icon: '✗'
      };
    }
    
    return {
      bgColor: 'bg-status-warning-light',
      borderColor: 'border-status-warning',
      titleColor: 'text-status-warning',
      icon: '?'
    };
  }

  render() {
    if (!this.content) return '';
    
    const style = this.getVerdictStyle();
    
    return `
      <div class="mb-3 p-3 ${style.bgColor} border ${style.borderColor} rounded-lg shadow-sm">
        <div class="flex items-center mb-2">
          <span class="text-base mr-2">${style.icon}</span>
          <h3 class="font-semibold text-lg ${style.titleColor}">진위 판단</h3>
        </div>
        <div class="text-lg text-text-main leading-relaxed font-medium">${this.content}</div>
      </div>
    `;
  }
}

// Export for use in content_script.js
window.VerdictBlock = VerdictBlock;
