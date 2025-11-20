// EvidenceBlock.js - 현대적인 근거 전용 블록

class EvidenceBlock {
  constructor(content, sources = [], evidenceType = 'general') {
    this.content = content;
    this.sources = sources;
    this.evidenceType = evidenceType;
    this.id = Math.random().toString(36).substr(2, 9);
    this.timestamp = new Date();
  }

  getEvidenceConfig() {
    const configs = {
      'supporting': {
        icon: '✅',
        emoji: '📊',
        label: '지지 근거',
        bgColor: 'bg-status-success-light',
        borderColor: 'border-status-success/30',
        headerColor: 'text-status-success-dark',
        iconBg: 'bg-status-success',
        iconTextClass: 'text-white'
      },
      'contradicting': {
        icon: '❌',
        emoji: '⚠️',
        label: '반박 근거',
        bgColor: 'bg-status-error-light',
        borderColor: 'border-status-error/30',
        headerColor: 'text-status-error-dark',
        iconBg: 'bg-status-error',
        iconTextClass: 'text-white'
      },
      'neutral': {
        icon: 'ℹ️',
        emoji: '📋',
        label: '중립 근거',
        bgColor: 'bg-status-info-light',
        borderColor: 'border-status-info/30',
        headerColor: 'text-status-info-dark',
        iconBg: 'bg-status-info',
        iconTextClass: 'text-white'
      },
      'general': {
        icon: '📄',
        emoji: '📋',
        label: '일반 근거',
        bgColor: 'bg-surface',
        borderColor: 'border-border',
        headerColor: 'text-text-primary',
        iconBg: 'bg-secondary',
        iconTextClass: 'text-text-primary'
      }
    };
    
    return configs[this.evidenceType] || configs['general'];
  }

  getSourcesList() {
    if (!this.sources || this.sources.length === 0) return '';
    
    return `
      <div class="mt-4 pt-3 border-t border-border-light">
        <h5 class="text-sm font-medium text-text-secondary mb-3 flex items-center">
          <span class="w-1.5 h-1.5 bg-primary rounded-full mr-2"></span>
          검증 출처 (${this.sources.length})
        </h5>
        <div class="space-y-2">
          ${this.sources.map((source, index) => `
            <div class="flex items-start space-x-3 p-2 bg-surface-hover rounded-lg">
              <div class="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span class="text-text-primary text-xs font-bold">${index + 1}</span>
              </div>
              <div class="flex-1 min-w-0">
                <a href="${source.url || '#'}" 
                   class="text-sm font-medium text-primary hover:text-primary-dark transition-colors block truncate"
                   target="_blank" title="${source.name || '출처'}">
                  ${source.name || `출처 ${index + 1}`}
                </a>
                ${source.description ? `
                  <p class="text-xs text-text-muted mt-1 line-clamp-2">${source.description}</p>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  getReliabilityScore() {
    // 신뢰도 점수 계산 (출처 수, 타입 등 기반)
    let score = 50; // 기본 점수
    
    if (this.sources.length > 0) score += Math.min(this.sources.length * 15, 40);
    if (this.evidenceType === 'supporting') score += 10;
    else if (this.evidenceType === 'contradicting') score -= 10;
    
    return Math.min(Math.max(score, 0), 100);
  }

  render() {
    if (!this.content) return '';
    
    const config = this.getEvidenceConfig();
    const reliability = this.getReliabilityScore();
    
    return `
      <div class="card mb-4 overflow-hidden animate-fade-in" data-evidence-id="${this.id}">
        <!-- Header -->
        <div class="${config.bgColor} p-4 border-b ${config.borderColor}">
          <div class="flex items-start space-x-3">
            <div class="w-10 h-10 ${config.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft">
              <span class="${config.iconTextClass || 'text-white'} text-lg">${config.emoji}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2 mb-1">
                <h3 class="font-semibold text-lg ${config.headerColor}">근거 자료</h3>
                <div class="badge ${this.evidenceType === 'supporting' ? 'badge-success' : 
                                   this.evidenceType === 'contradicting' ? 'badge-error' : 
                                   this.evidenceType === 'neutral' ? 'badge-info' : ''}">
                  ${config.label}
                </div>
              </div>
              <div class="flex items-center space-x-4 text-xs text-text-muted">
                <span>${this.sources.length}개 출처</span>
                <span>•</span>
                <span>신뢰도 ${reliability}%</span>
              </div>
            </div>
            <div class="flex space-x-1">
              <button class="icon-btn" onclick="window.toggleExpand('${this.id}')" title="펼치기/접기">
                <span class="text-xs">📖</span>
              </button>
              <button class="icon-btn" onclick="navigator.clipboard.writeText('${this.content.replace(/'/g, "\\'")}')">
                <span class="text-xs">📋</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="p-4">
          <div class="body-text leading-relaxed mb-4">
            ${this.formatContent(this.content)}
          </div>
          
          <!-- Reliability Bar -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-text-secondary">신뢰도 평가</span>
              <span class="text-sm font-bold ${config.headerColor}">${reliability}%</span>
            </div>
            <div class="w-full bg-border-light rounded-full h-2 overflow-hidden">
              <div class="${reliability >= 70 ? 'bg-status-success' : 
                          reliability >= 50 ? 'bg-status-warning' : 'bg-status-error'} 
                          h-full rounded-full transition-all duration-1000 ease-out" 
                   style="width: ${reliability}%"></div>
            </div>
          </div>

          <!-- Sources List -->
          ${this.getSourcesList()}

          <!-- Footer -->
          <div class="mt-4 pt-3 border-t border-border-light flex items-center justify-between">
            <div class="text-xs text-text-muted">
              ${this.timestamp.toLocaleString('ko-KR', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })} 수집됨
            </div>
            <div class="flex items-center space-x-2">
              ${this.evidenceType === 'supporting' ? 
                '<span class="text-xs text-status-success">✓ 지지</span>' : 
                this.evidenceType === 'contradicting' ? 
                '<span class="text-xs text-status-error">✗ 반박</span>' : 
                '<span class="text-xs text-text-muted">○ 중립</span>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  formatContent(content) {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" class="text-primary hover:text-primary-dark underline" target="_blank">$1</a>')
      .replace(/\n/g, '<br>');
  }

  // 정적 팩토리 메서드
  static createSupporting(content, sources = []) {
    return new EvidenceBlock(content, sources, 'supporting');
  }

  static createContradicting(content, sources = []) {
    return new EvidenceBlock(content, sources, 'contradicting');
  }

  static createNeutral(content, sources = []) {
    return new EvidenceBlock(content, sources, 'neutral');
  }

  // 인스턴스 메서드
  addSource(name, url, description = '') {
    this.sources.push({ name, url, description });
    this.update();
  }

  update() {
    const element = document.querySelector(`[data-evidence-id="${this.id}"]`);
    if (element) {
      element.outerHTML = this.render();
    }
  }

  remove() {
    const element = document.querySelector(`[data-evidence-id="${this.id}"]`);
    if (element) {
      element.classList.add('animate-fade-out');
      setTimeout(() => element.remove(), 300);
    }
  }
}

// 전역 헬퍼 함수
window.toggleExpand = function(evidenceId) {
  const element = document.querySelector(`[data-evidence-id="${evidenceId}"] .body-text`);
  if (element) {
    element.classList.toggle('line-clamp-3');
  }
};

// Export for use in content_script.js
window.EvidenceBlock = EvidenceBlock;
