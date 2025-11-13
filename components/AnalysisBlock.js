// AnalysisBlock.js - 현대적인 분석 결과 블록 컴포넌트

class AnalysisBlock {
  constructor(title, content, type = 'default', icon = null) {
    this.title = title;
    this.content = content;
    this.type = type;
    this.icon = icon || this.getDefaultIcon(type);
    this.id = Math.random().toString(36).substr(2, 9);
  }

  getDefaultIcon(type) {
    const icons = {
      'verdict': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L11 4.323V3a1 1 0 011-1zm-5 8.274l-.818 2.552c-.25.78-.03 1.621.58 2.16C5.274 15.464 6.055 16 7 16a3.989 3.989 0 002.667-1.019 1 1 0 00.285-1.05L8.214 8.51 5 8.274zm.259-1.045L2.846 8.13a1 1 0 00-.894 1.788l1.233.617-1.738 5.42a1 1 0 00.285 1.05A3.989 3.989 0 004.4 17.981h.002a3.989 3.989 0 002.667-1.019 1 1 0 00.285-1.05l-1.738-5.42 1.233-.617a1 1 0 00-.59-1.911z" clip-rule="evenodd"/></svg>',
      'evidence': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9 9a2 2 0 114 0 2 2 0 01-4 0z"/><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a4 4 0 00-3.446 6.032l-2.261 2.26a1 1 0 101.414 1.415l2.261-2.261A4 4 0 1011 5z" clip-rule="evenodd"/></svg>',
      'source': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M2 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 002 2H4a2 2 0 01-2-2V5zm3 1h6v4H5V6zm6 6H5v2h6v-2z" clip-rule="evenodd"/><path d="M15 7h1a2 2 0 012 2v5.5a1.5 1.5 0 01-3 0V7z"/></svg>',
      'analysis': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M13 7H7v6h6V7z"/><path fill-rule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clip-rule="evenodd"/></svg>',
      'summary': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>',
      'warning': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
      'success': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
      'error': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
      'info': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>',
      'default': '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>'
    };
    return icons[type] || icons['default'];
  }

  getStyleConfig() {
    const configs = {
      'verdict': {
        containerClass: this.content.includes('진짜') ? 'card-success' : 
                      this.content.includes('가짜') ? 'card-error' : 'card-warning',
        headerClass: this.content.includes('진짜') ? 'text-status-success-dark' : 
                    this.content.includes('가짜') ? 'text-status-error-dark' : 'text-status-warning-dark',
        iconBg: this.content.includes('진짜') ? 'bg-status-success' : 
               this.content.includes('가짜') ? 'bg-status-error' : 'bg-status-warning',
        priority: 'high'
      },
      'evidence': {
        containerClass: 'card-info',
        headerClass: 'text-status-info-dark',
        iconBg: 'bg-status-info',
        priority: 'medium'
      },
      'source': {
        containerClass: 'card',
        headerClass: 'text-text-primary',
        iconBg: 'bg-secondary',
        priority: 'medium'
      },
      'analysis': {
        containerClass: 'card',
        headerClass: 'text-text-primary',
        iconBg: 'bg-primary',
        priority: 'low'
      },
      'warning': {
        containerClass: 'card-warning',
        headerClass: 'text-status-warning-dark',
        iconBg: 'bg-status-warning',
        priority: 'high'
      },
      'default': {
        containerClass: 'card',
        headerClass: 'text-text-primary',
        iconBg: 'bg-secondary',
        priority: 'low'
      }
    };
    
    return configs[this.type] || configs['default'];
  }

  render() {
    if (!this.content) return '';
    
    const config = this.getStyleConfig();
    const truncatedContent = this.content.length > 300 ? 
      this.content.substring(0, 300) + '...' : this.content;
    
    return `
      <div class="${config.containerClass} mb-4 animate-fade-in" 
           data-block-id="${this.id}"
           role="article"
           aria-label="${this.title}">
        <!-- Header -->
        <div class="flex items-start space-x-3 mb-3">
          <div class="w-10 h-10 ${config.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft" aria-hidden="true">
            <span class="text-white">${this.icon}</span>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-base ${config.headerClass} mb-1 truncate">
              ${this.title}
            </h3>
            ${config.priority === 'high' ? 
              '<div class="badge badge-warning mb-2">중요</div>' : ''}
          </div>
          <div class="flex space-x-1">
            <button class="icon-btn" 
                    onclick="this.closest('[data-block-id]').querySelector('.block-content').classList.toggle('hidden')"
                    title="펼치기/접기"
                    aria-label="내용 펼치기/접기">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
              </svg>
            </button>
            <button class="icon-btn" 
                    onclick="navigator.clipboard.writeText('${this.content.replace(/'/g, "\\'")}'); alert('복사되었습니다!');"
                    title="복사하기"
                    aria-label="내용 복사">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="block-content">
          <div class="body-text leading-relaxed text-sm ${this.content.length > 300 ? 'expandable-content' : ''}">
            <div class="content-preview">
              ${this.formatContent(truncatedContent)}
            </div>
            ${this.content.length > 300 ? `
              <div class="content-full hidden">
                ${this.formatContent(this.content)}
              </div>
              <button class="mt-3 text-sm text-primary hover:text-primary-dark transition-colors expand-btn flex items-center space-x-1" 
                      onclick="const btn = this; btn.closest('.expandable-content').querySelector('.content-preview').classList.add('hidden'); btn.closest('.expandable-content').querySelector('.content-full').classList.remove('hidden'); btn.style.display = 'none';"
                      aria-label="전체 내용 보기">
                <span>더 보기</span>
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10.293 15.707a1 1 0 010-1.414L14.586 10l-4.293-4.293a1 1 0 111.414-1.414l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                </svg>
              </button>
            ` : ''}
          </div>
          
          <!-- Metadata -->
          <div class="flex items-center justify-between mt-4 pt-3 border-t border-border-light">
            <div class="flex items-center space-x-2 text-xs text-text-muted">
              <span>분석 블록</span>
              <span>•</span>
              <span>${new Date().toLocaleString('ko-KR', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</span>
            </div>
            <div class="flex items-center space-x-2">
              ${this.type === 'verdict' ? 
                '<div class="badge badge-success">검증됨</div>' : 
                '<div class="badge">분석</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  formatContent(content) {
    // 텍스트 포맷팅: 링크, 강조 등
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" class="text-primary hover:text-primary-dark underline" target="_blank">$1</a>')
      .replace(/\n/g, '<br>');
  }

  // 정적 메서드: 여러 블록 렌더링
  static renderMultiple(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return `
        <div class="text-center py-12">
          <div class="w-16 h-16 bg-primary-light rounded-full flex items-center justify-center mx-auto mb-4">
            <span class="text-2xl">📭</span>
          </div>
          <p class="text-text-secondary">분석 결과가 없습니다</p>
        </div>
      `;
    }

    // 우선순위별 정렬
    const sortedBlocks = blocks.sort((a, b) => {
      const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
      const aPriority = a.getStyleConfig().priority;
      const bPriority = b.getStyleConfig().priority;
      return priorityOrder[aPriority] - priorityOrder[bPriority];
    });

    return sortedBlocks.map(block => block.render()).join('');
  }

  // 인스턴스 메서드: 업데이트
  update(newContent) {
    this.content = newContent;
    const element = document.querySelector(`[data-block-id="${this.id}"]`);
    if (element) {
      element.outerHTML = this.render();
    }
  }

  // 인스턴스 메서드: 제거
  remove() {
    const element = document.querySelector(`[data-block-id="${this.id}"]`);
    if (element) {
      element.classList.add('animate-fade-out');
      setTimeout(() => element.remove(), 300);
    }
  }
}

// Export for use in content_script.js
window.AnalysisBlock = AnalysisBlock;
