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
      'verdict': '⚖️',
      'evidence': '🔍',
      'source': '📰',
      'analysis': '🧠',
      'summary': '📋',
      'warning': '⚠️',
      'success': '✅',
      'error': '❌',
      'info': 'ℹ️',
      'default': '📄'
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
      <div class="${config.containerClass} mb-4 animate-fade-in" data-block-id="${this.id}">
        <!-- Header -->
        <div class="flex items-start space-x-3 mb-3">
          <div class="w-10 h-10 ${config.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 shadow-soft">
            <span class="text-white text-lg">${this.icon}</span>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-lg ${config.headerClass} mb-1 truncate">
              ${this.title}
            </h3>
            ${config.priority === 'high' ? 
              '<div class="badge badge-warning mb-2">중요</div>' : ''}
          </div>
          <div class="flex space-x-1">
            <button class="icon-btn" onclick="this.closest('[data-block-id]').querySelector('.block-content').classList.toggle('hidden')">
              <span class="text-xs">📖</span>
            </button>
            <button class="icon-btn" onclick="navigator.clipboard.writeText('${this.content.replace(/'/g, "\\'")}')">
              <span class="text-xs">📋</span>
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="block-content">
          <div class="body-text leading-relaxed ${this.content.length > 300 ? 'expandable-content' : ''}">
            <div class="content-preview">
              ${this.formatContent(truncatedContent)}
            </div>
            ${this.content.length > 300 ? `
              <div class="content-full hidden">
                ${this.formatContent(this.content)}
              </div>
              <button class="mt-3 text-sm text-primary hover:text-primary-dark transition-colors expand-btn" 
                      onclick="const btn = this; btn.closest('.expandable-content').querySelector('.content-preview').classList.add('hidden'); btn.closest('.expandable-content').querySelector('.content-full').classList.remove('hidden'); btn.style.display = 'none';">
                더 보기 →
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
