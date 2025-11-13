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
    // 더 정교한 키워드 분석
    const contentLower = this.content.toLowerCase();
    
    if (contentLower.includes('진짜') || contentLower.includes('사실') || contentLower.includes('정확')) {
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
    } else if (contentLower.includes('가짜') || contentLower.includes('거짓') || contentLower.includes('허위')) {
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
    } else if (contentLower.includes('부분') || contentLower.includes('일부')) {
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
               style="width: ${percentage}%"
               role="progressbar" 
               aria-valuenow="${percentage}" 
               aria-valuemin="0" 
               aria-valuemax="100"></div>
        </div>
      </div>
    `;
  }

  getSourcesList() {
    if (!this.sources || this.sources.length === 0) return '';
    
    return `
      <div class="mt-4">
        <h5 class="text-sm font-medium text-text-secondary mb-2 flex items-center">
          <svg class="w-4 h-4 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clip-rule="evenodd"/>
          </svg>
          검증 출처
        </h5>
        <div class="space-y-2">
          ${this.sources.map((source, index) => `
            <div class="flex items-center space-x-2 text-xs group">
              <div class="w-5 h-5 bg-primary/10 text-primary rounded-full flex items-center justify-center flex-shrink-0 font-medium">
                ${index + 1}
              </div>
              <a href="${source.url || '#'}" 
                 class="text-primary hover:text-primary-dark transition-colors truncate group-hover:underline flex-1"
                 target="_blank"
                 rel="noopener noreferrer"
                 aria-label="출처 ${index + 1}: ${source.name || '출처'}">
                ${source.name || `출처 ${index + 1}`}
              </a>
              <svg class="w-3 h-3 text-text-muted group-hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
              </svg>
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
      <div class="card-elevated mb-6 overflow-hidden animate-fade-in" 
           data-verdict-id="${this.id}"
           role="article"
           aria-label="진위 판단 결과">
        <!-- Gradient Header -->
        <div class="bg-gradient-to-r ${config.gradient} p-6 border-b border-border-light">
          <div class="flex items-start space-x-4">
            <!-- Large Icon -->
            <div class="w-16 h-16 ${config.iconBg} rounded-2xl flex items-center justify-center shadow-medium flex-shrink-0" 
                 aria-hidden="true">
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
              
              <div class="text-base text-text-primary font-medium leading-relaxed">
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
            <div class="text-center p-4 bg-surface rounded-xl hover:shadow-soft transition-shadow">
              <div class="text-2xl mb-2" aria-hidden="true">${config.emoji}</div>
              <div class="text-xs text-text-muted font-medium">판정</div>
            </div>
            <div class="text-center p-4 bg-surface rounded-xl hover:shadow-soft transition-shadow">
              <div class="text-lg font-bold text-text-primary mb-2">
                ${this.confidence ? this.confidence + '%' : 'N/A'}
              </div>
              <div class="text-xs text-text-muted font-medium">신뢰도</div>
            </div>
          </div>

          <!-- Sources -->
          ${this.getSourcesList()}

          <!-- Timestamp -->
          <div class="mt-6 pt-4 border-t border-border-light flex items-center justify-between">
            <div class="text-xs text-text-muted flex items-center space-x-1.5">
              <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd"/>
              </svg>
              <span>${this.timestamp.toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })} 분석 완료</span>
            </div>
            <div class="flex space-x-2">
              <button class="icon-btn" 
                      onclick="window.shareVerdict('${this.id}')" 
                      title="공유하기"
                      aria-label="판정 결과 공유">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                </svg>
              </button>
              <button class="icon-btn" 
                      onclick="window.saveVerdict('${this.id}')" 
                      title="저장하기"
                      aria-label="판정 결과 저장">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
                </svg>
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
