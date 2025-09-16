// AnalysisPanel.js - 뉴스 분석 패널 컴포넌트 (리팩토링됨)

class AnalysisPanel {
  constructor() {
    this.panelId = 'news-analysis-panel';
    this.newsBlocks = new Map(); // 뉴스 블록들을 관리하는 Map
    this.blockIdCounter = 0; // 고유 ID 생성용
  }

  // 메인 패널 생성
  create() {
    const existingPanel = document.getElementById(this.panelId);
    if (existingPanel) {
      return existingPanel;
    }

    const panelContainer = document.createElement('div');
    panelContainer.id = this.panelId;
    panelContainer.className = 'fixed bottom-1 right-1 w-96 max-h-96 bg-background shadow-2xl z-50 overflow-y-auto rounded-xl border border-secondary';
    
    panelContainer.style.cssText += `
      transform: translateX(100%);
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
      opacity: 0;
    `;
    
    document.body.appendChild(panelContainer);
    
    // 초기 컨텐츠 렌더링
    this.renderPanel(panelContainer);
    
    // 애니메이션 시작
    setTimeout(() => {
      panelContainer.style.transform = 'translateX(0)';
      panelContainer.style.opacity = '1';
    }, 10);
    
    return panelContainer;
  }

  // 패널 전체 렌더링
  renderPanel(panel) {
    panel.innerHTML = `
      ${this.renderHeader()}
      <div class="p-4">
        <div id="news-blocks-container" class="space-y-3">
          ${this.newsBlocks.size === 0 ? this.renderEmptyState() : this.renderNewsBlocks()}
        </div>
      </div>
    `;
    
    this.attachEvents(panel);
  }

  // 헤더 렌더링
  renderHeader() {
    return `
      <div class="flex items-center mb-4 pb-3 border-b border-secondary bg-secondary -m-4 p-4 rounded-t-xl">
        <h2 class="text-lg font-bold text-text-primary flex-1">뉴스 분석 대기열</h2>
        <div class="flex justify-end items-center gap-1">
          <button id="Settings" class="text-text-secondary hover:text-text-primary hover:bg-background rounded-full w-8 h-8 flex items-center justify-center transition-colors mr-1">⚙️</button>
          <button id="close-panel" class="text-text-secondary hover:text-text-primary hover:bg-background rounded-full w-8 h-8 flex items-center justify-center transition-colors">&times;</button>
        </div>
      </div>
    `;
  }

  // 빈 상태 렌더링
  renderEmptyState() {
    return `
      <div class="text-center py-8">
        <div class="text-text-secondary text-lg mb-2">📰</div>
        <div class="text-text-secondary">분석할 뉴스가 없습니다</div>
      </div>
    `;
  }

  // 뉴스 블록들 렌더링
  renderNewsBlocks() {
    return Array.from(this.newsBlocks.values())
      .map(block => this.renderNewsBlock(block))
      .join('');
  }

  // 개별 뉴스 블록 렌더링
  renderNewsBlock(block) {
    const { id, title, url, status, result, progress } = block;
    
    let actionButtons = '';
    let statusIndicator = '';
    
    switch (status) {
      case 'pending':
        actionButtons = `
          <button class="analyze-btn bg-primary text-text-primary px-3 py-1 rounded text-sm hover:bg-secondary transition-colors" data-id="${id}">분석</button>
          <button class="delete-btn bg-status-error text-background px-3 py-1 rounded text-sm hover:opacity-80 transition-opacity ml-2" data-id="${id}">삭제</button>
        `;
        break;
      case 'analyzing':
        statusIndicator = `
          <div class="flex items-center text-status-warning text-sm">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-status-warning mr-2"></div>
            ${progress || '분석 중...'}
          </div>
        `;
        break;
      case 'completed':
        actionButtons = `
          <button class="delete-btn bg-status-error text-background px-3 py-1 rounded text-sm hover:opacity-80 transition-opacity" data-id="${id}">삭제</button>
        `;
        break;
      case 'error':
        actionButtons = `
          <button class="retry-btn bg-status-warning text-text-primary px-3 py-1 rounded text-sm hover:opacity-80 transition-opacity" data-id="${id}">재시도</button>
          <button class="delete-btn bg-status-error text-background px-3 py-1 rounded text-sm hover:opacity-80 transition-opacity ml-2" data-id="${id}">삭제</button>
        `;
        break;
    }
    
    const isClickable = status === 'completed' ? 'cursor-pointer hover:bg-primary' : '';
    
    return `
      <div class="news-block border border-secondary rounded-lg p-3 bg-background ${isClickable} transition-colors" data-id="${id}">
        <div class="flex justify-between items-start">
          <div class="flex-1 mr-3">
            <h3 class="text-text-primary font-medium text-sm mb-1 line-clamp-2">${this.escapeHtml(title)}</h3>
            <div class="text-text-secondary text-xs truncate">${this.escapeHtml(url)}</div>
          </div>
          <div class="flex flex-col items-end gap-2">
            ${statusIndicator}
            <div class="flex">
              ${actionButtons}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // HTML 이스케이프
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 새 뉴스 추가
  addNews(title, url, content) {
    const id = ++this.blockIdCounter;
    this.newsBlocks.set(id, {
      id,
      title,
      url,
      content,
      status: 'pending',
      result: null,
      progress: null,
      timestamp: Date.now()
    });
    
    this.updatePanel();
    return id;
  }

  // 뉴스 블록 상태 업데이트
  updateNewsStatus(id, status, data = {}) {
    const block = this.newsBlocks.get(id);
    if (!block) return;
    
    block.status = status;
    if (data.progress) block.progress = data.progress;
    if (data.result) block.result = data.result;
    if (data.error) block.error = data.error;
    
    this.updatePanel();
  }

  // 뉴스 블록 삭제
  deleteNews(id) {
    this.newsBlocks.delete(id);
    this.updatePanel();
  }

  // 패널 업데이트
  updatePanel() {
    const panel = document.getElementById(this.panelId);
    if (panel) {
      const container = panel.querySelector('#news-blocks-container');
      if (container) {
        container.innerHTML = this.newsBlocks.size === 0 ? this.renderEmptyState() : this.renderNewsBlocks();
        this.attachBlockEvents(container);
      }
    }
  }

  // 이벤트 연결
  attachEvents(panel) {
    this.attachCloseEvent(panel);
    this.attachSettingsEvent(panel);
    this.attachBlockEvents(panel);
  }

  // 블록 이벤트 연결
  attachBlockEvents(container) {
    // 분석 버튼
    container.querySelectorAll('.analyze-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        this.startAnalysis(id);
      });
    });
    
    // 삭제 버튼
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        this.deleteNews(id);
      });
    });
    
    // 재시도 버튼
    container.querySelectorAll('.retry-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        this.startAnalysis(id);
      });
    });
    
    // 뉴스 블록 클릭 (완료된 것만)
    container.querySelectorAll('.news-block').forEach(block => {
      const id = parseInt(block.dataset.id);
      const newsData = this.newsBlocks.get(id);
      
      if (newsData && newsData.status === 'completed') {
        block.addEventListener('click', () => {
          this.showAnalysisResult(id);
        });
      }
    });
  }

  // 분석 시작
  startAnalysis(id) {
    const block = this.newsBlocks.get(id);
    if (!block) return;
    
    this.updateNewsStatus(id, 'analyzing', { progress: '분석 준비 중...' });
    
    // Gemini 분석 요청
    const fullPrompt = this.generateAnalysisPrompt(block.title, block.content);
    
    chrome.runtime.sendMessage({
      action: "analyzeNewsWithGemini",
      prompt: fullPrompt,
      blockId: id
    });
  }

  // 분석 프롬프트 생성
  generateAnalysisPrompt(title, content) {
    const articleContent = `${title}\n${content}`;
    
    return `
## 역할
당신은 주어진 기사 텍스트의 **논리적 구조, 근거 제시 방식, 표현의 적절성**만을 분석하는 **'뉴스 텍스트 분석가'** 입니다. 당신의 유일한 임무는 아래의 '절대적 분석 원칙'과 '판단 조건'에 따라, 외부 세계의 사실이나 당신의 사전 지식과 비교하지 않고 오직 **주어진 텍스트 자체**만을 평가하는 것입니다.

---

### **[매우 중요] 절대적 분석 원칙: 외부 정보 및 사전 지식 사용 금지**
1.  **오직 텍스트만 분석:** 당신은 제공된 기사 원문 **내부의 정보만을** 분석 대상으로 삼아야 합니다.
2.  **사전 지식 금지:** 당신의 학습 데이터에 저장된 **인물, 직책, 사건, 날짜 등 어떠한 외부 정보도 판단의 근거로 사용해서는 안 됩니다.** 
3.  **내부 논리 중심 판단:** 당신의 임무는 '이 내용이 현실 세계에서 사실인가?'를 검증하는 것이 아니라, **'이 기사가 주장과 근거를 논리적으로 제시하고 있는가?'** 를 평가하는 것입니다.

## 판단 조건 및 중요도

※ **판단 원칙:** 여러 조건에 해당하는 경우, **가장 심각한 유형(가장 높은 중요도)을 기준으로 '진위'를 최종 결정**합니다.
※ **기본 판단:** 아래 조건 중 어느 것에도 해당하지 않는 경우, 해당 기사는 **'진짜 뉴스'**로 판단합니다.

#### **[중요도: 최상] → 최종 판단: 가짜뉴스**
*   **유형: 1. 사실 및 출처의 신뢰도 문제**
    *   **1-1. 기사 내 명백한 내용상 모순:** 기사의 앞부분과 뒷부분의 내용이 서로 충돌하거나 모순되는 경우.
    *   **1-2. 불분명하거나 신뢰할 수 없는 출처:** 주장의 근거를 제시하지 않거나, 의도적으로 모호하게 표현하여 권위를 부여하는 방식.
    *   **1-3. 통계 왜곡 및 오용:** 통계의 일부만 보여주거나, 출처가 명시되지 않은 통계 자료를 근거로 삼는 경우.

#### **[중요도: 높음] → 최종 판단: 가짜일 가능성이 높은 뉴스**
*   **유형: 2. 논리 및 구조적 허점**
    *   **2-1. 논리적 비약:** 제시된 근거만으로는 도저히 결론에 도달할 수 없을 정도로, 근거와 주장 사이에 합리적인 연결고리가 부족한 경우.
    *   **2-2. 근거 없는 의혹 제기:** 명확한 근거 없이 언론사가 자체적으로 의혹을 만들고 애매한 표현으로 마무리하여 독자에게 의심과 불신을 심어주는 방식.

#### **[중요도: 중간] → 최종 판단: 가짜일 가능성이 있는 뉴스**
*   **유형: 3. 선동적·감정적 표현 방식**
    *   **3-1. 단정적·선동적 어조:** 검증되지 않은 사실을 확정된 것처럼 표현하여 독자의 판단을 '강요'하는 방식.
    *   **3-2. 감정적 표현 사용:** 중립적인 단어 대신 감정을 자극하는 표현을 남발하여 이성적 판단을 방해하는 경우.

*   **유형: 4. 기사의 의도 문제**
    *   **4-1. 제목과 내용의 불일치 (낚시성 제목):** 독자의 클릭을 유도하기 위해 자극적이거나 과장된 제목을 사용했으나, 본문 내용은 제목과 무관하거나 일부만 다루는 경우.
    *   **4-2. 홍보 및 광고성 기사:** 기사의 형식을 빌려 특정 상품, 서비스, 인물 등을 일방적으로 긍정적으로 묘사하는 경우.

---

## 출력 형식
반드시 다음 JSON 형식으로만 응답해주세요:

{
  "진위": "판단 결과('가짜 뉴스' / '가짜일 가능성이 높은 뉴스' / '가짜일 가능성이 있는 뉴스' / '진짜 뉴스')",
  "근거": "탐지된 조건 번호와 이름 (진짜 뉴스인 경우 빈 문자열)",
  "분석": "위 근거들을 종합하여 기사의 어떤 부분이 왜 문제인지 혹은 신뢰할 수 있는지를 구체적으로 서술"
}

---
[뉴스 기사 본문]
${articleContent}
---`;
  }

  // 분석 결과 보기 모달
  showAnalysisResult(id) {
    const block = this.newsBlocks.get(id);
    if (!block || !block.result) return;
    
    const modal = this.createResultModal(block);
    document.body.appendChild(modal);
    
    // 애니메이션
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.querySelector('.modal-content').style.transform = 'scale(1)';
    }, 10);
  }

  // 결과 모달 생성
  createResultModal(block) {
    const modal = document.createElement('div');
    modal.className = 'result-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.6);
      z-index: 2147483648;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    const result = block.result;
    const verdict = result.진위 || 'N/A';
    const evidence = result.근거 || 'N/A';
    const analysis = result.분석 || 'N/A';
    
    modal.innerHTML = `
      <div class="modal-content" style="
        background: #F2F2F2;
        border-radius: 12px;
        padding: 32px;
        width: 90%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
        transform: scale(0.8);
        transition: transform 0.3s ease;
      ">
        <button class="close-modal" style="
          position: absolute;
          top: 16px;
          right: 16px;
          background: none;
          border: none;
          font-size: 24px;
          color: #737373;
          cursor: pointer;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        ">&times;</button>
        
        <h2 style="color: #0D0D0D; font-size: 20px; font-weight: bold; margin-bottom: 16px; padding-right: 40px;">
          분석 결과
        </h2>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">📰 제목</h3>
          <p style="color: #737373; line-height: 1.5;">${this.escapeHtml(block.title)}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">⚖️ 진위 판단</h3>
          <p style="color: #0D0D0D; background: #BF9780; padding: 12px; border-radius: 8px; font-weight: 500;">${this.escapeHtml(verdict)}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">📋 근거</h3>
          <p style="color: #737373; line-height: 1.5; background: #F2F2F2; border: 1px solid #BF9780; padding: 12px; border-radius: 8px;">${this.escapeHtml(evidence)}</p>
        </div>
        
        <div>
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">🔍 상세 분석</h3>
          <p style="color: #737373; line-height: 1.5; background: #F2F2F2; border: 1px solid #BF9780; padding: 12px; border-radius: 8px;">${this.escapeHtml(analysis)}</p>
        </div>
      </div>
    `;
    
    // 닫기 이벤트
    const closeBtn = modal.querySelector('.close-modal');
    const closeModal = () => {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    };
    
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    // 호버 효과
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = '#BF9780';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });
    
    return modal;
  }

  // 닫기 이벤트
  attachCloseEvent(panel) {
    const closeBtn = panel.querySelector('#close-panel');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        panel.style.transform = 'translateX(100%)';
        panel.style.opacity = '0';
        setTimeout(() => {
          panel.style.display = 'none';
          this.createFloatingButton();
        }, 300);
      });
    }
  }

  // 플로팅 버튼 생성
  createFloatingButton() {
    const existingFloatingBtn = document.getElementById('floating-news-analysis-btn');
    if (existingFloatingBtn) {
      existingFloatingBtn.remove();
    }

    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'floating-news-analysis-btn';
    floatingBtn.innerHTML = '🔍';
    floatingBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #BF9780, #BF9780);
      color: white;
      border: none;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px #BF9780;
      z-index: 999998;
      transform: scale(0);
      transition: all 0.3s ease;
    `;

    document.body.appendChild(floatingBtn);

    setTimeout(() => {
      floatingBtn.style.transform = 'scale(1)';
    }, 10);

    // 호버 효과
    floatingBtn.addEventListener('mouseenter', () => {
      floatingBtn.style.transform = 'scale(1.1)';
      floatingBtn.style.boxShadow = '0 6px 20px #BF9780';
    });

    floatingBtn.addEventListener('mouseleave', () => {
      floatingBtn.style.transform = 'scale(1)';
      floatingBtn.style.boxShadow = '0 4px 12px #BF9780';
    });

    // 클릭 시 패널 다시 열기
    floatingBtn.addEventListener('click', () => {
      const panel = document.getElementById('news-analysis-panel');
      if (panel) {
        panel.style.display = 'block';
        panel.style.transform = 'translateX(0)';
        panel.style.opacity = '1';
        floatingBtn.style.transform = 'scale(0)';
        setTimeout(() => {
          floatingBtn.remove();
        }, 300);
      }
    });
  }

  // 설정 이벤트 (API 키 관리)
  attachSettingsEvent(panel) {
    const settingsBtn = panel.querySelector('#Settings');
    
    if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (document.getElementById('api-key-input-modal')) {
          return;
        }
        
        this.checkSavedApiKey().then((savedApiKey) => {
          const modal = this.createSettingsModal(savedApiKey);
          document.body.appendChild(modal);
          
          setTimeout(() => {
            modal.style.opacity = '1';
            modal.querySelector('.modal-content').style.transform = 'scale(1)';
          }, 10);
        });
      });
    }
  }

  // 설정 모달 생성
  createSettingsModal(savedApiKey) {
    const modal = document.createElement('div');
    modal.id = 'api-key-input-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.6);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    
    const isEdit = !!savedApiKey;
    const maskedKey = savedApiKey ? `${savedApiKey.substring(0, 8)}...${savedApiKey.substring(savedApiKey.length - 4)}` : '';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = `
      background: #F2F2F2;
      border-radius: 12px;
      padding: 32px;
      width: 560px;
      height: 270px;
      position: relative;
      display: flex;
      flex-direction: column;
      transform: scale(0.8);
      opacity: 0;
      transition: all 0.3s ease;
    `;
    
    if (isEdit) {
      modalContent.innerHTML = `
        <button class="close-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
        <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키 설정</h2>
        <div style="background: #F2F2F2; border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; flex: 1; display: flex; align-items: center; justify-content: center;">
          <span style="font-family: monospace; font-size: 16px; color: #0D0D0D;">${maskedKey}</span>
        </div>
        <button class="edit-key-btn" style="background: #BF9780; color: white; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; width: 100%; transition: background-color 0.2s; font-size: 16px;">수정</button>
      `;
    } else {
      modalContent.innerHTML = `
        <button class="close-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
        <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키를 입력하세요</h2>
        <input class="api-key-input" type="text" placeholder="Gemini API Key" style="border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; width: 100%; font-size: 16px; box-sizing: border-box; flex: 1; outline: none; transition: border-color 0.2s;" />
        <button class="submit-key-btn" style="background: #F2CEA2; color: #0D0D0D; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; width: 100%; transition: background-color 0.2s; font-size: 16px;">확인</button>
      `;
    }
    
    modal.appendChild(modalContent);
    
    // 이벤트 연결
    this.attachModalEvents(modal, modalContent, savedApiKey);
    
    return modal;
  }

  // 모달 이벤트 연결
  attachModalEvents(modal, modalContent, savedApiKey) {
    const closeModal = () => {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    };
    
    // 닫기 버튼
    const closeBtn = modalContent.querySelector('.close-modal');
    closeBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = '#BF9780';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });
    
    // 배경 클릭으로 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    // 수정 버튼 (표시 모드)
    const editBtn = modalContent.querySelector('.edit-key-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        modalContent.innerHTML = `
          <button class="close-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
          <h2 style="font-size: 24px; font-weight: bold; margin-bottom: 32px; text-align: center; color: #0D0D0D;">API 키 수정</h2>
          <input class="api-key-input" type="text" placeholder="새로운 Gemini API Key" value="${savedApiKey}" style="border: 2px solid #BF9780; border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; width: 100%; font-size: 16px; box-sizing: border-box; flex: 1; outline: none; transition: border-color 0.2s;" />
          <button class="submit-key-btn" style="background: #F2CEA2; color: #0D0D0D; padding: 16px 32px; border-radius: 8px; font-weight: 600; border: none; cursor: pointer; width: 100%; transition: background-color 0.2s; font-size: 16px;">저장</button>
        `;
        
        this.attachModalEvents(modal, modalContent, savedApiKey);
      });
      
      editBtn.addEventListener('mouseenter', () => {
        editBtn.style.backgroundColor = '#A68570';
      });
      editBtn.addEventListener('mouseleave', () => {
        editBtn.style.backgroundColor = '#BF9780';
      });
    }
    
    // 입력 및 제출 (입력 모드)
    const input = modalContent.querySelector('.api-key-input');
    const submitBtn = modalContent.querySelector('.submit-key-btn');
    
    if (input && submitBtn) {
      // 포커스 효과
      input.addEventListener('focus', () => {
        input.style.borderColor = '#F2CEA2';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = '#BF9780';
      });
      
      // 자동 포커스
      setTimeout(() => input.focus(), 100);
      
      // 제출 버튼
      const handleSubmit = () => {
        const apiKey = input.value.trim();
        
        if (apiKey) {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ apiKey: apiKey }, () => {
              alert('API 키가 저장되었습니다!');
              closeModal();
            });
          } else {
            localStorage.setItem('gemini_api_key', apiKey);
            alert('API 키가 저장되었습니다!');
            closeModal();
          }
        } else {
          alert('API 키를 입력해주세요.');
        }
      };
      
      submitBtn.addEventListener('click', handleSubmit);
      
      // Enter 키로 제출
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        }
      });
      
      // 호버 효과
      submitBtn.addEventListener('mouseenter', () => {
        submitBtn.style.backgroundColor = '#E6B892';
      });
      submitBtn.addEventListener('mouseleave', () => {
        submitBtn.style.backgroundColor = '#F2CEA2';
      });
    }
  }

  // 저장된 API 키 확인
  async checkSavedApiKey() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get(['apiKey'], (result) => {
            resolve(result.apiKey || '');
          });
        });
      } else {
        return localStorage.getItem('gemini_api_key') || '';
      }
    } catch (error) {
      console.log('API 키 확인 오류:', error);
      return '';
    }
  }

  // 분석 진행 상황 업데이트 (외부에서 호출)
  updateAnalysisProgress(blockId, progress) {
    this.updateNewsStatus(blockId, 'analyzing', { progress });
  }

  // 분석 완료 (외부에서 호출)
  completeAnalysis(blockId, result) {
    this.updateNewsStatus(blockId, 'completed', { result });
  }

  // 분석 실패 (외부에서 호출)
  failAnalysis(blockId, error) {
    this.updateNewsStatus(blockId, 'error', { error });
  }
}

// Export for use in content_script.js
window.AnalysisPanel = AnalysisPanel;
