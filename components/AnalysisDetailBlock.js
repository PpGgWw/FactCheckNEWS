// AnalysisDetailBlock.js - 상세 분석 전용 블록 (완전 리디자인)

class AnalysisDetailBlock {
  constructor(content, analysisType = 'general') {
    this.content = content;
    this.analysisType = analysisType;
    this.id = Math.random().toString(36).substr(2, 9);
    this.timestamp = new Date();
  }

  getAnalysisConfig() {
    const configs = {
      'detailed': {
        icon: '🔍',
        label: '상세 분석',
        iconBg: 'bg-primary',
        bgColor: 'bg-primary-light/50',
        borderColor: 'border-primary/20',
        headerColor: 'text-primary-dark'
      },
      'summary': {
        icon: '📋',
        label: '분석 요약',
        iconBg: 'bg-secondary',
        bgColor: 'bg-secondary-light/50',
        borderColor: 'border-secondary/20',
        headerColor: 'text-secondary-dark'
      },
      'general': {
        icon: '📄',
        label: '일반 분석',
        iconBg: 'bg-accent',
        bgColor: 'bg-accent-light/50',
        borderColor: 'border-accent/20',
        headerColor: 'text-accent-dark'
      }
    };
    
    return configs[this.analysisType] || configs['general'];
  }

  render() {
    if (!this.content) return '';
    
    const config = this.getAnalysisConfig();
    
    return `
      <div class="card mb-4 overflow-hidden animate-fade-in" data-analysis-id="${this.id}">
        <!-- Modern Header -->
        <div class="${config.bgColor} p-4 border-b ${config.borderColor}">
          <div class="flex items-center space-x-3">
            <!-- Icon -->
            <div class="w-10 h-10 ${config.iconBg} rounded-lg flex items-center justify-center shadow-soft flex-shrink-0">
              <span class="text-white text-xl">${config.icon}</span>
            </div>
            
            <!-- Title -->
            <div class="flex-1 min-w-0">
              <h3 class="text-base font-semibold ${config.headerColor}">${config.label}</h3>
              <p class="text-xs text-text-muted mt-0.5">
                ${this.timestamp.toLocaleString('ko-KR', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })} 생성됨
              </p>
            </div>
            
            <!-- Actions -->
            <div class="flex items-center space-x-1">
              <button class="icon-btn" onclick="navigator.clipboard.writeText(\`${this.escapeHtml(this.content)}\`)" 
                      title="복사하기" aria-label="분석 내용 복사">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
              <button class="icon-btn" onclick="window.expandAnalysis('${this.id}')" 
                      title="확대/축소" aria-label="분석 내용 확대">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Content Body -->
        <div class="p-4 bg-surface">
          <div class="prose prose-sm max-w-none">
            <div class="text-sm text-text-primary leading-relaxed space-y-2">
              ${this.formatContent(this.content)}
            </div>
          </div>
        </div>

        <!-- Footer Stats (Optional) -->
        <div class="px-4 py-3 bg-surface-hover border-t border-border-light flex items-center justify-between text-xs">
          <div class="flex items-center space-x-4 text-text-muted">
            <span class="flex items-center space-x-1">
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
              </svg>
              <span>${this.getWordCount()}자</span>
            </span>
            <span class="flex items-center space-x-1">
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
              </svg>
              <span>약 ${this.getReadTime()}분 읽기</span>
            </span>
          </div>
          <div class="badge badge-info">${config.label}</div>
        </div>
      </div>
    `;
  }

  formatContent(content) {
    return content
      // 마크다운 지원
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 bg-border-light rounded text-xs font-mono">$1</code>')
      // 링크
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" class="text-primary hover:text-primary-dark underline transition-colors" target="_blank" rel="noopener noreferrer">$1</a>')
      // 줄바꿈
      .replace(/\n\n/g, '</p><p class="mt-3">')
      .replace(/\n/g, '<br>')
      // 리스트 처리
      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal">$2</li>');
  }

  escapeHtml(text) {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
  }

  getWordCount() {
    return this.content.length;
  }

  getReadTime() {
    // 평균 독서 속도: 분당 300자
    const minutes = Math.ceil(this.content.length / 300);
    return Math.max(1, minutes);
  }

  // 정적 팩토리 메서드
  static createDetailed(content) {
    return new AnalysisDetailBlock(content, 'detailed');
  }

  static createSummary(content) {
    return new AnalysisDetailBlock(content, 'summary');
  }

  // 인스턴스 메서드
  update(newContent) {
    this.content = newContent;
    const element = document.querySelector(`[data-analysis-id="${this.id}"]`);
    if (element) {
      element.outerHTML = this.render();
    }
  }

  remove() {
    const element = document.querySelector(`[data-analysis-id="${this.id}"]`);
    if (element) {
      element.classList.add('opacity-0', 'scale-95');
      setTimeout(() => element.remove(), 200);
    }
  }
}

// 전역 헬퍼 함수
window.expandAnalysis = function(analysisId) {
  const element = document.querySelector(`[data-analysis-id="${analysisId}"] .prose`);
  if (element) {
    element.classList.toggle('max-w-none');
    element.classList.toggle('max-w-2xl');
  }
};

// Export for use in content_script.js
window.AnalysisDetailBlock = AnalysisDetailBlock;
