// EvidenceBlock.js - 근거 전용 블록

class EvidenceBlock {
  constructor(content) {
    this.content = content;
  }

  render() {
    if (!this.content) return '';
    
    return `
      <div class="mb-3 p-3 bg-secondary border border-secondary rounded-lg shadow-sm">
        <div class="flex items-center mb-2">
          <span class="text-base mr-2">📋</span>
          <h3 class="font-semibold text-sm text-text-primary">근거</h3>
        </div>
        <div class="text-sm text-text-primary leading-relaxed">${this.content}</div>
      </div>
    `;
  }
}

// Export for use in content_script.js
window.EvidenceBlock = EvidenceBlock;
