// VerdictBlock.js - 현대적인 진위 판단 전용 블록

class VerdictBlock {
  constructor(content, confidence = null, sources = []) {
    this.content = content;
    this.confidence = confidence;
    this.sources = sources;
    this.id = Math.random().toString(36).substr(2, 9);
    this.timestamp = new Date();
  }

  getVerdictConfig() {
    // 더 정교한 키워드 분석 (우선순위: 구체적 → 일반적)
    const contentLower = this.content.toLowerCase();
    
    // 1순위: 정확한 5단계 판단 매칭
    if (contentLower.includes('거짓') && !contentLower.includes('대체로')) {
      return {
        type: 'false',
        label: '거짓',
        bgColor: 'bg-status-error-light',
        borderColor: 'border-status-error',
        titleColor: 'text-status-error-dark',
        iconBg: 'bg-status-error',
        icon: '✗',
        emoji: '❌',
        gradient: 'from-status-error-light to-red-50'
      };
    } else if (contentLower.includes('대체로 거짓')) {
      return {
        type: 'mostly-false',
        label: '대체로 거짓',
        bgColor: 'bg-status-error-light',
        borderColor: 'border-status-error',
        titleColor: 'text-status-error-dark',
        iconBg: 'bg-status-error',
        icon: '✗',
        emoji: '⚠️',
        gradient: 'from-orange-100 to-red-50'
      };
    } else if (contentLower.includes('일부 사실')) {
      return {
        type: 'partial',
        label: '일부 사실',
        bgColor: 'bg-status-warning-light',
        borderColor: 'border-status-warning',
        titleColor: 'text-status-warning-dark',
        iconBg: 'bg-status-warning',
        icon: '◐',
        emoji: '⚠️',
        gradient: 'from-status-warning-light to-yellow-50'
      };
    } else if (contentLower.includes('대체로 사실')) {
      return {
        type: 'mostly-true',
        label: '대체로 사실',
        bgColor: 'bg-status-success-light',
        borderColor: 'border-status-success',
        titleColor: 'text-status-success-dark',
        iconBg: 'bg-status-success',
        icon: '✓',
        emoji: '✅',
        gradient: 'from-green-100 to-green-50'
      };
    } else if (contentLower === '사실' || (contentLower.includes('사실') && !contentLower.includes('일부') && !contentLower.includes('대체로') && !contentLower.includes('부분'))) {
      return {
        type: 'true',
        label: '사실',
        bgColor: 'bg-status-success-light',
        borderColor: 'border-status-success',
        titleColor: 'text-status-success-dark',
        iconBg: 'bg-status-success',
        icon: '✓',
        emoji: '✅',
        gradient: 'from-status-success-light to-green-50'
      };
    }
    
    // 2순위: 구형 키워드 호환성 (진짜/가짜)
    if (contentLower.includes('진짜') || contentLower.includes('정확')) {
      return {
        type: 'true',
        label: '사실',
        bgColor: 'bg-status-success-light',
        borderColor: 'border-status-success',
        titleColor: 'text-status-success-dark',
        iconBg: 'bg-status-success',
        icon: '✓',
        emoji: '✅',
        gradient: 'from-status-success-light to-green-50'
      };
    } else if (contentLower.includes('가짜') || contentLower.includes('허위')) {
      return {
        type: 'false',
        label: '허위',
        bgColor: 'bg-status-error-light',
        borderColor: 'border-status-error',
        titleColor: 'text-status-error-dark',
        iconBg: 'bg-status-error',
        icon: '✗',
        emoji: '❌',
        gradient: 'from-status-error-light to-red-50'
      };
    } else if (contentLower.includes('부분')) {
      return {
        type: 'partial',
        label: '부분적 사실',
        bgColor: 'bg-status-warning-light',
        borderColor: 'border-status-warning',
        titleColor: 'text-status-warning-dark',
        iconBg: 'bg-status-warning',
        icon: '◐',
        emoji: '⚠️',
        gradient: 'from-status-warning-light to-yellow-50'
      };
    }
    
    return {
      type: 'unknown',
      label: '판단 불가',
      bgColor: 'bg-status-info-light',
      borderColor: 'border-status-info',
      titleColor: 'text-status-info-dark',
      iconBg: 'bg-status-info',
      icon: '?',
      emoji: '❓',
      gradient: 'from-status-info-light to-blue-50'
    };
  }

  getConfidenceBar() {
    if (!this.confidence) return '';
    
    const percentage = Math.min(Math.max(this.confidence, 0), 100);
    const config = this.getVerdictConfig();
    
    let barColor = 'bg-status-info';
    if (percentage >= 80) barColor = 'bg-status-success';
    else if (percentage >= 60) barColor = 'bg-status-warning';
    else if (percentage >= 40) barColor = 'bg-status-error';
    
    return `
      <div class="mt-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-text-secondary">신뢰도</span>
          <span class="text-sm font-bold ${config.titleColor}">${percentage}%</span>
        </div>
        <div class="w-full bg-border-light rounded-full h-2 overflow-hidden">
          <div class="${barColor} h-full rounded-full transition-all duration-1000 ease-out" 
               style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  }

  getSourcesList() {
    if (!this.sources || this.sources.length === 0) return '';
    
    return `
      <div class="mt-4">
        <h5 class="text-sm font-medium text-text-secondary mb-2">검증 출처</h5>
        <div class="space-y-2">
          ${this.sources.map((source, index) => `
            <div class="flex items-center space-x-2 text-xs">
              <div class="w-1.5 h-1.5 bg-primary rounded-full"></div>
              <a href="${source.url || '#'}" 
                 class="text-primary hover:text-primary-dark transition-colors truncate"
                 target="_blank">
                ${source.name || `출처 ${index + 1}`}
              </a>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  render() {
    if (!this.content) return '';
    
    const config = this.getVerdictConfig();
    
    return `
      <div class="card-elevated mb-6 overflow-hidden animate-fade-in" data-verdict-id="${this.id}">
        <!-- Gradient Header -->
        <div class="bg-gradient-to-r ${config.gradient} p-6 border-b border-border-light">
          <div class="flex items-start space-x-4">
            <!-- Large Icon -->
            <div class="w-16 h-16 ${config.iconBg} rounded-2xl flex items-center justify-center shadow-medium flex-shrink-0">
              <span class="text-white text-2xl font-bold">${config.icon}</span>
            </div>
            
            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-3 mb-2">
                <h3 class="text-xl font-bold ${config.titleColor}">진위 판단</h3>
                <div class="badge badge-${config.type === 'true' ? 'success' : config.type === 'false' ? 'error' : 'warning'}">
                  ${config.label}
                </div>
              </div>
              
              <div class="text-lg text-text-primary font-medium leading-relaxed">
                ${this.formatContent(this.content)}
              </div>
              
              <!-- Confidence Bar -->
              ${this.getConfidenceBar()}
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="p-6">
          <!-- Analysis Details -->
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="text-center p-3 bg-surface rounded-xl">
              <div class="text-2xl mb-1">${config.emoji}</div>
              <div class="text-xs text-text-muted">판정</div>
            </div>
            <div class="text-center p-3 bg-surface rounded-xl">
              <div class="text-lg font-bold text-text-primary mb-1">
                ${this.confidence ? this.confidence + '%' : 'N/A'}
              </div>
              <div class="text-xs text-text-muted">신뢰도</div>
            </div>
          </div>

          <!-- Sources -->
          ${this.getSourcesList()}

          <!-- Timestamp -->
          <div class="mt-6 pt-4 border-t border-border-light flex items-center justify-between">
            <div class="text-xs text-text-muted">
              ${this.timestamp.toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })} 분석 완료
            </div>
            <div class="flex space-x-2">
              <button class="icon-btn" onclick="window.shareVerdict('${this.id}')" title="공유하기">
                <span class="text-xs">📤</span>
              </button>
              <button class="icon-btn" onclick="window.saveVerdict('${this.id}')" title="저장하기">
                <span class="text-xs">💾</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  formatContent(content) {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/\n/g, '<br>');
  }

  // 정적 팩토리 메서드
  static createFromAnalysis(analysisText, confidence, sources) {
    return new VerdictBlock(analysisText, confidence, sources);
  }

  static createQuickVerdict(isTrue, reason = '') {
    const content = isTrue ? 
      `이 뉴스는 **사실**입니다. ${reason}` : 
      `이 뉴스는 **허위**입니다. ${reason}`;
    
    return new VerdictBlock(content, isTrue ? 85 : 15);
  }

  // 인스턴스 메서드
  update(newContent, newConfidence = null) {
    this.content = newContent;
    if (newConfidence !== null) {
      this.confidence = newConfidence;
    }
    
    const element = document.querySelector(`[data-verdict-id="${this.id}"]`);
    if (element) {
      element.outerHTML = this.render();
    }
  }

  addSource(name, url) {
    this.sources.push({ name, url });
    this.update(this.content, this.confidence);
  }

  remove() {
    const element = document.querySelector(`[data-verdict-id="${this.id}"]`);
    if (element) {
      element.classList.add('animate-fade-out');
      setTimeout(() => element.remove(), 300);
    }
  }
}

// 전역 헬퍼 함수들
window.shareVerdict = function(verdictId) {
  const element = document.querySelector(`[data-verdict-id="${verdictId}"]`);
  if (element && navigator.share) {
    navigator.share({
      title: '팩트체크 결과',
      text: '뉴스 검증 결과를 확인해보세요.',
      url: window.location.href
    });
  }
};

window.saveVerdict = function(verdictId) {
  // 로컬 스토리지에 저장 로직
  console.log('Verdict saved:', verdictId);
};

// Export for use in content_script.js
window.VerdictBlock = VerdictBlock;
