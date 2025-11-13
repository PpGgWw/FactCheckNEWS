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
        iconBg: 'bg-status-success'
      },
      'contradicting': {
        icon: '❌',
        emoji: '⚠️',
        label: '반박 근거',
        bgColor: 'bg-status-error-light',
        borderColor: 'border-status-error/30',
        headerColor: 'text-status-error-dark',
        iconBg: 'bg-status-error'
      },
      'neutral': {
        icon: 'ℹ️',
        emoji: '📋',
        label: '중립 근거',
        bgColor: 'bg-status-info-light',
        borderColor: 'border-status-info/30',
        headerColor: 'text-status-info-dark',
        iconBg: 'bg-status-info'
      },
      'general': {
        icon: '📄',
        emoji: '📋',
        label: '일반 근거',
        bgColor: 'bg-surface',
        borderColor: 'border-border',
        headerColor: 'text-text-primary',
        iconBg: 'bg-secondary'
      }
    };
    
    return configs[this.evidenceType] || configs['general'];
  }

  getSourcesList() {
    if (!this.sources || this.sources.length === 0) return '';
    
    return `
      <div class="mt-4 pt-3 border-t border-border-light">
        <h5 class="text-sm font-medium text-text-secondary mb-3 flex items-center space-x-1.5">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
          </svg>
          <span>검증 출처 (${this.sources.length})</span>
        </h5>
        <ul class="space-y-2" role="list">
          ${this.sources.map((source, index) => `
            <li class="flex items-start space-x-3 p-2 bg-surface-hover rounded-lg hover:bg-opacity-50 transition-colors">
              <div class="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" aria-hidden="true">
                <span class="text-white text-xs font-bold">${index + 1}</span>
              </div>
              <div class="flex-1 min-w-0">
                <a href="${source.url || '#'}" 
                   class="text-sm font-medium text-primary hover:text-primary-dark transition-colors inline-flex items-start space-x-1 group"
                   target="_blank" 
                   rel="noopener noreferrer"
                   title="${source.name || '출처'}"
                   aria-label="출처 ${index + 1}: ${source.name || '출처'}">
                  <span class="group-hover:underline break-words">${source.name || `출처 ${index + 1}`}</span>
                  <svg class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 opacity-50 group-hover:opacity-100" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                    <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
                  </svg>
                </a>
                ${source.description ? `
                  <p class="text-xs text-text-muted mt-1 line-clamp-2 leading-snug">${source.description}</p>
                ` : ''}
              </div>
            </li>
          `).join('')}
        </ul>
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
      <div class="card mb-4 overflow-hidden animate-fade-in" 
           data-evidence-id="${this.id}"
           role="article"
           aria-label="근거 자료">
        <!-- Header -->
        <div class="${config.bgColor} p-4 border-b ${config.borderColor}">
          <div class="flex items-start space-x-3">
            <div class="w-10 h-10 ${config.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft" aria-hidden="true">
              <span class="text-white text-lg">${config.emoji}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2 mb-1">
                <h3 class="font-semibold text-base ${config.headerColor}">근거 자료</h3>
                <div class="badge ${this.evidenceType === 'supporting' ? 'badge-success' : 
                                   this.evidenceType === 'contradicting' ? 'badge-error' : 
                                   this.evidenceType === 'neutral' ? 'badge-info' : ''}">
                  ${config.label}
                </div>
              </div>
              <div class="flex items-center space-x-4 text-xs text-text-muted">
                <span class="flex items-center space-x-1">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd"/>
                  </svg>
                  <span>${this.sources.length}개 출처</span>
                </span>
                <span>•</span>
                <span class="flex items-center space-x-1">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                  <span>신뢰도 ${reliability}%</span>
                </span>
              </div>
            </div>
            <div class="flex space-x-1">
              <button class="icon-btn" 
                      onclick="window.toggleExpand('${this.id}')" 
                      title="펼치기/접기"
                      aria-label="근거 내용 펼치기/접기">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                </svg>
              </button>
              <button class="icon-btn" 
                      onclick="navigator.clipboard.writeText('${this.content.replace(/'/g, "\\'")}'); alert('복사되었습니다!');"
                      title="복사하기"
                      aria-label="근거 내용 복사">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="p-4">
          <div class="body-text leading-relaxed mb-4 text-sm">
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
                   style="width: ${reliability}%"
                   role="progressbar" 
                   aria-valuenow="${reliability}" 
                   aria-valuemin="0" 
                   aria-valuemax="100"></div>
            </div>
          </div>

          <!-- Sources List -->
          ${this.getSourcesList()}

          <!-- Footer -->
          <div class="mt-4 pt-3 border-t border-border-light flex items-center justify-between">
            <div class="text-xs text-text-muted flex items-center space-x-1.5">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
              </svg>
              <span>${this.timestamp.toLocaleString('ko-KR', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })} 수집됨</span>
            </div>
            <div class="flex items-center space-x-2">
              ${this.evidenceType === 'supporting' ? 
                '<span class="text-xs text-status-success font-medium flex items-center space-x-1"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg><span>지지</span></span>' : 
                this.evidenceType === 'contradicting' ? 
                '<span class="text-xs text-status-error font-medium flex items-center space-x-1"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg><span>반박</span></span>' : 
                '<span class="text-xs text-text-muted font-medium flex items-center space-x-1"><svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg><span>중립</span></span>'}
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
