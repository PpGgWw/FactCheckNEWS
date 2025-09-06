// VerdictBlock.js - 진위 판단 전용 블록

class VerdictBlock {
  constructor(content) {
    this.content = content;
  }

  getVerdictStyle() {
    if (this.content.includes('진짜')) {
      return {
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        titleColor: 'text-green-700',
        icon: '✓'
      };
    } else if (this.content.includes('가짜')) {
      return {
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        titleColor: 'text-red-700',
        icon: '✗'
      };
    }
    
    return {
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      titleColor: 'text-yellow-700',
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
          <h3 class="font-semibold text-sm ${style.titleColor}">진위 판단</h3>
        </div>
        <div class="text-sm text-gray-800 leading-relaxed font-medium">${this.content}</div>
      </div>
    `;
  }
}

// Export for use in content_script.js
window.VerdictBlock = VerdictBlock;
