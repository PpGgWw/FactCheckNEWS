// AnalysisPanel.js - 뉴스 분석 패널 컴포넌트 (리팩토링됨)

class AnalysisPanel {
  constructor() {
    this.panelId = 'news-analysis-panel';
    this.newsBlocks = new Map(); // 분석된 뉴스 블록들을 관리하는 Map
    this.currentNews = null; // 현재 페이지의 뉴스
    this.blockIdCounter = 0; // 고유 ID 생성용
    this.streamingResults = new Map(); // 실시간 스트리밍 결과 저장
    
    // 저장된 뉴스 블록 데이터 로드
    this.loadSavedNewsBlocks();
  }

  // 메인 패널 생성
  create() {
    const existingPanel = document.getElementById(this.panelId);
    if (existingPanel) {
      return existingPanel;
    }

    const panelContainer = document.createElement('div');
    panelContainer.id = this.panelId;
    panelContainer.style.cssText = `
      position: fixed;
      bottom: 4px;
      right: 4px;
      width: 384px;
      height: 700px;
      background: #F2F2F2;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      z-index: 2147483646;
      border-radius: 12px;
      border: 1px solid #BF9780;
      transform: translateX(100%);
      transition: transform 0.3s ease-out, opacity 0.3s ease-out;
      opacity: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
    // CSS 애니메이션 스타일 추가
    if (!document.getElementById('analysis-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'analysis-panel-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    panel.innerHTML = `
      ${this.renderHeader()}
      
      <!-- 현재 뉴스 블록 (고정) -->
      <div id="current-news-section" style="
        padding: 16px;
        border-bottom: 2px solid #BF9780;
        background: #F8F8F8;
        flex-shrink: 0;
      ">
        <h3 style="
          font-size: 14px;
          font-weight: bold;
          color: #0D0D0D;
          margin: 0 0 12px 0;
        ">현재 뉴스</h3>
        <div id="current-news-container">
          ${this.renderCurrentNews()}
        </div>
      </div>
      
      <!-- 분석된 뉴스 리스트 (스크롤) -->
      <div style="
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      ">
        <div style="
          padding: 16px 16px 8px 16px;
          flex-shrink: 0;
        ">
          <h3 style="
            font-size: 14px;
            font-weight: bold;
            color: #0D0D0D;
            margin: 0;
          ">분석 기록</h3>
        </div>
        <div style="
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 16px 16px 16px;
        ">
          <div id="analyzed-news-container" style="
            display: flex; 
            flex-direction: column; 
            gap: 12px;
            width: 100%;
          ">
            ${this.renderAnalyzedNews()}
          </div>
        </div>
      </div>
    `;
    
    // panel에 AnalysisPanel 인스턴스 저장
    panel.__analysisPanel = this;
    
    this.attachEvents(panel);
  }

  // 헤더 렌더링
  renderHeader() {
    return `
      <div style="
        display: flex;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid #BF9780;
        background: #BF9780;
        border-radius: 12px 12px 0 0;
        flex-shrink: 0;
      ">
        <h2 style="
          font-size: 18px;
          font-weight: bold;
          color: #0D0D0D;
          flex: 1;
          margin: 0;
        ">뉴스 분석 대기열</h2>
        <div style="display: flex; justify-content: end; align-items: center; gap: 4px;">
          <button id="Settings" style="
            color: #737373;
            background: none;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            margin-right: 4px;
          " onmouseover="this.style.color='#0D0D0D'; this.style.background='#F2F2F2';" onmouseout="this.style.color='#737373'; this.style.background='none';">⚙️</button>
          <button id="close-panel" style="
            color: #737373;
            background: none;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 20px;
          " onmouseover="this.style.color='#0D0D0D'; this.style.background='#F2F2F2';" onmouseout="this.style.color='#737373'; this.style.background='none';">&times;</button>
        </div>
      </div>
    `;
  }

  // 빈 상태 렌더링
  renderEmptyState() {
    return `
      <div style="text-align: center; padding: 32px 0;">
        <div style="color: #737373; font-size: 18px; margin-bottom: 8px;">📰</div>
        <div style="color: #737373;">분석할 뉴스가 없습니다</div>
      </div>
    `;
  }

  // 현재 뉴스 렌더링
  renderCurrentNews() {
    if (!this.currentNews) {
      return `
        <div style="text-align: center; padding: 16px 0; color: #737373;">
          현재 페이지에서 뉴스를 찾을 수 없습니다
        </div>
      `;
    }
    
    return this.renderNewsBlock(this.currentNews, true);
  }

  // 분석된 뉴스들 렌더링
  renderAnalyzedNews() {
    if (this.newsBlocks.size === 0) {
      return `
        <div style="text-align: center; padding: 16px 0; color: #737373;">
          분석된 뉴스가 없습니다
        </div>
      `;
    }
    
    return Array.from(this.newsBlocks.values())
      .sort((a, b) => b.timestamp - a.timestamp) // 최신 뉴스가 맨 위로
      .map(block => this.renderNewsBlock(block, false))
      .join('');
  }

  // 뉴스 블록들 렌더링
  renderNewsBlocks() {
    return Array.from(this.newsBlocks.values())
      .sort((a, b) => b.timestamp - a.timestamp) // 최신 뉴스가 맨 위로
      .map(block => this.renderNewsBlock(block))
      .join('');
  }

  // 개별 뉴스 블록 렌더링
  renderNewsBlock(block, isCurrent = false) {
    const { id, title, url, status, result, progress } = block;
    
    let actionButtons = '';
    let statusIndicator = '';
    
    if (isCurrent) {
      // 현재 뉴스의 경우
      switch (status) {
        case 'pending':
          actionButtons = `
            <button class="analyze-current-btn" data-id="${id}" style="
              background: #F2CEA2;
              color: #0D0D0D;
              padding: 6px 16px;
              border-radius: 4px;
              font-size: 14px;
              border: none;
              cursor: pointer;
              transition: all 0.2s;
              width: 100%;
            " onmouseover="this.style.background='#BF9780'" onmouseout="this.style.background='#F2CEA2'">분석하기</button>
          `;
          break;
        case 'analyzing':
          statusIndicator = `
            <div style="
              display: flex; 
              align-items: center; 
              justify-content: center;
              color: #d97706; 
              font-size: 14px;
              padding: 6px 0;
              width: 100%;
            ">
              <div style="
                width: 16px;
                height: 16px;
                border: 2px solid #d97706;
                border-top: 2px solid transparent;
                border-radius: 50%;
                margin-right: 8px;
                animation: spin 1s linear infinite;
              "></div>
              ${progress || '분석 중...'}
            </div>
          `;
          break;
        case 'completed':
        case 'error':
          actionButtons = `
            <button class="analyze-current-btn" data-id="${id}" style="
              background: #F2CEA2;
              color: #0D0D0D;
              padding: 6px 16px;
              border-radius: 4px;
              font-size: 14px;
              border: none;
              cursor: pointer;
              transition: all 0.2s;
              width: 100%;
            " onmouseover="this.style.background='#BF9780'" onmouseout="this.style.background='#F2CEA2'">다시 분석</button>
          `;
          break;
      }
    } else {
      // 분석된 뉴스 리스트의 경우 - 삭제 버튼만 표시
      switch (status) {
        case 'pending':
        case 'analyzing':
        case 'completed':
        case 'error':
          actionButtons = `
            <button class="delete-btn" data-id="${id}" style="
              background: #dc2626;
              color: #F2F2F2;
              padding: 6px 16px;
              border-radius: 4px;
              font-size: 14px;
              border: none;
              cursor: pointer;
              transition: opacity 0.2s;
              width: 100%;
            " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">삭제</button>
          `;
          break;
      }
      
      // 분석 중일 때만 진행상황 표시
      if (status === 'analyzing') {
        statusIndicator = `
          <div style="
            display: flex; 
            align-items: center; 
            justify-content: center;
            color: #d97706; 
            font-size: 14px;
            padding: 6px 0;
            width: 100%;
          ">
            <div style="
              width: 16px;
              height: 16px;
              border: 2px solid #d97706;
              border-top: 2px solid transparent;
              border-radius: 50%;
              margin-right: 8px;
              animation: spin 1s linear infinite;
            "></div>
            ${progress || '분석 중...'}
          </div>
        `;
      }
    }
    
    const isClickable = status === 'completed';
    const cursorStyle = isClickable ? 'cursor: pointer;' : '';
    const hoverStyle = isClickable ? 'onmouseover="this.style.background=\'#F2CEA2\'" onmouseout="this.style.background=\'#F2F2F2\'"' : '';
    
    return `
      <div class="news-block" data-id="${id}" style="
        border: 1px solid #BF9780;
        border-radius: 8px;
        background: #F2F2F2;
        transition: all 0.3s ease;
        width: 100%;
        overflow: hidden;
      ">
        <!-- 뉴스 내용 영역 -->
        <div class="news-content-area" data-id="${id}" style="
          padding: 12px;
          ${cursorStyle}
        " ${isClickable ? hoverStyle : ''}>
          <h3 style="
            color: #0D0D0D;
            font-weight: 500;
            font-size: 14px;
            margin-bottom: 4px;
            line-height: 1.4;
            word-break: break-word;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            width: 100%;
          ">${this.escapeHtml(title)}</h3>
          <div style="
            color: #737373;
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            width: 100%;
          ">${this.escapeHtml(url)}</div>
        </div>
        
        <!-- 상태 표시 또는 버튼 영역 -->
        <div style="
          border-top: 1px solid #BF9780;
          padding: 8px 12px;
          background: rgba(191, 151, 128, 0.1);
        ">
          ${statusIndicator ? statusIndicator : `
            <div style="
              display: flex;
              gap: 8px;
              width: 100%;
            ">
              ${actionButtons}
            </div>
          `}
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

  // 현재 뉴스 설정
  setCurrentNews(title, url, content) {
    this.currentNews = {
      id: 'current',
      title,
      url,
      content,
      status: 'pending',
      result: null,
      progress: null,
      timestamp: Date.now()
    };
    this.updatePanel();
    return 'current';
  }

  // 새 뉴스 추가 (분석된 뉴스 리스트에 추가)
  addNews(title, url, content) {
    // URL 정규화 (쿼리 파라미터 제거)
    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };
    
    const normalizedUrl = normalizeUrl(url);
    
    // 중복 URL 체크 (정규화된 URL로 비교)
    const existingBlock = Array.from(this.newsBlocks.values()).find(block => 
      normalizeUrl(block.url) === normalizedUrl
    );
    
    if (existingBlock) {
      console.log('이미 존재하는 뉴스입니다:', normalizedUrl);
      alert('이 뉴스는 이미 분석 목록에 있습니다.');
      return existingBlock.id;
    }
    
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
    
    // 데이터 저장
    this.saveNewsBlocks();
    
    this.updatePanel();
    return id;
  }

  // 뉴스 블록 상태 업데이트
  updateNewsStatus(id, status, result = null, progress = null, error = null) {
    console.log('updateNewsStatus 호출됨:', { id, status, result, progress, error });
    
    let block;
    if (id === 'current') {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(id);
    }
    
    if (!block) {
      console.error('블록을 찾을 수 없음, ID:', id);
      return;
    }
    
    block.status = status;
    if (progress) block.progress = progress;
    if (result) block.result = result;
    if (error) block.error = error;
    
    // 분석된 뉴스만 저장 (현재 뉴스는 페이지별로 관리)
    if (id !== 'current') {
      this.saveNewsBlocks();
    }
    
    console.log('블록 상태 업데이트됨:', block);
    this.updatePanel();
  }

  // 뉴스 블록 삭제
  deleteNews(id) {
    this.newsBlocks.delete(id);
    
    // 데이터 저장
    this.saveNewsBlocks();
    
    this.updatePanel();
  }

  // 패널 업데이트
  updatePanel() {
    const panel = document.getElementById(this.panelId);
    if (panel) {
      // 현재 뉴스 컨테이너 업데이트
      const currentContainer = panel.querySelector('#current-news-container');
      if (currentContainer) {
        currentContainer.innerHTML = this.renderCurrentNews();
      }
      
      // 분석된 뉴스 컨테이너 업데이트
      const analyzedContainer = panel.querySelector('#analyzed-news-container');
      if (analyzedContainer) {
        analyzedContainer.innerHTML = this.renderAnalyzedNews();
      }
      
      // 이벤트 다시 연결
      this.attachBlockEvents(panel);
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
    // 현재 뉴스 분석 버튼
    container.querySelectorAll('.analyze-current-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('현재 뉴스 분석 버튼 클릭');
        this.analyzeCurrentNews();
      });
    });
    
    // 삭제 버튼
    container.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        console.log('삭제 버튼 클릭, ID:', id);
        this.deleteNews(id);
      });
    });
    
    // 뉴스 내용 영역 클릭 (완료된 것과 분석 중인 것)
    container.querySelectorAll('.news-content-area').forEach(contentArea => {
      const id = contentArea.dataset.id;
      let newsData;
      
      if (id === 'current') {
        newsData = this.currentNews;
      } else {
        newsData = this.newsBlocks.get(parseInt(id));
      }
      
      if (newsData) {
        if (newsData.status === 'completed') {
          // 완료된 뉴스 - 결과 보기
          contentArea.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('완료된 뉴스 클릭, ID:', id);
            this.showAnalysisResult(id);
          });
        } else if (newsData.status === 'analyzing') {
          // 분석 중인 뉴스 - 실시간 보기
          contentArea.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('분석 중인 뉴스 클릭, ID:', id);
            this.showStreamingResult(id);
          });
        }
      }
    });
  }

  // 현재 뉴스 분석
  analyzeCurrentNews() {
    if (!this.currentNews) {
      alert('현재 뉴스가 없습니다.');
      return;
    }
    
    // 이미 분석 목록에 있는지 확인
    const normalizeUrl = (urlString) => {
      try {
        const urlObj = new URL(urlString);
        return urlObj.origin + urlObj.pathname;
      } catch {
        return urlString;
      }
    };
    
    const normalizedUrl = normalizeUrl(this.currentNews.url);
    const existingBlock = Array.from(this.newsBlocks.values()).find(block => 
      normalizeUrl(block.url) === normalizedUrl
    );
    
    if (existingBlock) {
      alert('이 뉴스는 이미 분석 목록에 있습니다.');
      return;
    }
    
    // 현재 뉴스를 분석 목록에 추가하고 분석 시작
    const newId = this.addNews(this.currentNews.title, this.currentNews.url, this.currentNews.content);
    this.startAnalysis(newId);
  }

  // 분석 시작
  startAnalysis(id) {
    console.log('startAnalysis 호출됨, ID:', id);
    const block = this.newsBlocks.get(id);
    if (!block) {
      console.error('블록을 찾을 수 없음, ID:', id);
      return;
    }
    
    console.log('분석할 블록:', block);
    
    this.updateNewsStatus(id, 'analyzing', null, 'API 키 확인 중...');
    
    // 분석 시작과 동시에 실시간 모달 표시
    setTimeout(() => {
      this.showStreamingResult(id);
    }, 500);
    
    // API 키 확인
    setTimeout(() => {
      this.updateNewsStatus(id, 'analyzing', null, '분석 요청 준비 중...');
      
      setTimeout(() => {
        this.updateNewsStatus(id, 'analyzing', null, 'Gemini AI에 전송 중...');
        
        setTimeout(() => {
          this.updateNewsStatus(id, 'analyzing', null, 'AI가 분석 중...');
          
          // Gemini 분석 요청
          const fullPrompt = this.generateAnalysisPrompt(block.title, block.content);
          
          console.log('Gemini로 분석 요청 전송, blockId:', id);
          chrome.runtime.sendMessage({
            action: "analyzeNewsWithGemini",
            prompt: fullPrompt,
            blockId: id
          });
        }, 800);
      }, 500);
    }, 300);
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
    let block;
    if (id === 'current') {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(parseInt(id));
    }
    
    if (!block || !block.result) {
      console.log('분석 결과가 없습니다:', id, block);
      return;
    }
    
    const modal = this.createResultModal(block);
    document.body.appendChild(modal);
    
    // 애니메이션
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.querySelector('.modal-content').style.transform = 'scale(1)';
    }, 10);
  }

  // 실시간 스트리밍 결과 보기 모달
  showStreamingResult(id) {
    let block;
    if (id === 'current') {
      block = this.currentNews;
    } else {
      block = this.newsBlocks.get(parseInt(id));
    }
    
    if (!block || block.status !== 'analyzing') {
      console.log('분석 중이 아닙니다:', id, block);
      return;
    }
    
    const modal = this.createStreamingModal(block, id);
    document.body.appendChild(modal);
    
    // 애니메이션
    setTimeout(() => {
      modal.style.opacity = '1';
      modal.querySelector('.modal-content').style.transform = 'scale(1)';
    }, 10);
  }

  // 실시간 스트리밍 모달 생성
  createStreamingModal(block, blockId) {
    const modal = document.createElement('div');
    modal.className = 'streaming-modal';
    modal.setAttribute('data-streaming-modal', blockId);
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(13,13,13,0.6);
      z-index: 2147483649;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = `
      background: #F2F2F2;
      border-radius: 12px;
      padding: 32px;
      width: 90%;
      max-width: 800px;
      max-height: 90%;
      position: relative;
      display: flex;
      flex-direction: column;
      transform: scale(0.8);
      transition: all 0.3s ease;
      overflow: hidden;
    `;

    const currentResult = this.streamingResults.get(blockId) || '';
    
    modalContent.innerHTML = `
      <button class="close-modal" style="position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; color: #737373; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background-color 0.2s;">&times;</button>
      
      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 12px; color: #0D0D0D;">실시간 분석 진행상황</h2>
        <h3 style="font-size: 16px; font-weight: 500; color: #737373; margin: 0; line-height: 1.4; word-break: break-word;">${this.escapeHtml(block.title)}</h3>
      </div>
      
      <div style="
        flex: 1;
        overflow-y: auto;
        border: 2px solid #BF9780;
        border-radius: 8px;
        padding: 20px;
        background: white;
        margin-bottom: 16px;
      ">
        <div class="streaming-content" style="
          font-size: 14px;
          line-height: 1.6;
          color: #0D0D0D;
          white-space: pre-wrap;
          word-break: break-word;
        ">
          ${this.getInitialStreamingMessage(block, currentResult)}
          <span class="typing-cursor" style="
            display: inline-block;
            width: 2px;
            height: 1.2em;
            background: #BF9780;
            margin-left: 2px;
            animation: blink 1s infinite;
          "></span>
        </div>
      </div>
      
      <div style="text-align: center;">
        <span style="color: #737373; font-size: 12px;">분석이 완료되면 자동으로 결과가 저장됩니다</span>
      </div>
    `;

    // 깜빡이는 커서 애니메이션 스타일 추가
    if (!document.getElementById('streaming-cursor-style')) {
      const style = document.createElement('style');
      style.id = 'streaming-cursor-style';
      style.textContent = `
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    modal.appendChild(modalContent);

    // 모달 닫기 이벤트
    const closeBtn = modalContent.querySelector('.close-modal');
    closeBtn.addEventListener('click', () => {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 300);
    });
    
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.backgroundColor = '#BF9780';
    });
    
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.backgroundColor = 'transparent';
    });

    // 배경 클릭으로 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 300);
      }
    });

    return modal;
  }

  // 스트리밍 모달 내용 업데이트
  updateStreamingModal(modal, newContent) {
    const contentDiv = modal.querySelector('.streaming-content');
    if (contentDiv) {
      contentDiv.innerHTML = `
        ${newContent}
        <span class="typing-cursor" style="
          display: inline-block;
          width: 2px;
          height: 1.2em;
          background: #BF9780;
          margin-left: 2px;
          animation: blink 1s infinite;
        "></span>
      `;
      
      // 스크롤을 맨 아래로
      const scrollContainer = contentDiv.parentElement;
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  // 초기 스트리밍 메시지 생성
  getInitialStreamingMessage(block, currentResult) {
    if (currentResult) {
      return currentResult;
    }
    
    // 진행상황에 따른 동적 메시지
    const progress = block.progress || 'AI가 분석을 시작하고 있습니다...';
    
    const messages = [
  '<span style="color: #BF9780; font-weight: bold;">Gemini AI</span>가 뉴스를 분석하고 있습니다...\n\n',
  '기사 내용을 이해하고 있습니다...\n\n',
  '논리적 구조를 파악 중입니다...\n\n',
  '객관성과 근거를 검토하고 있습니다...\n\n',
  '분석 결과를 작성 중입니다...\n\n'
    ];
    
    if (progress.includes('API 키')) {
      return `<span style="color: #737373;">${progress}</span>`;
    } else if (progress.includes('준비')) {
      return messages[0] + `<span style="color: #737373;">${progress}</span>`;
    } else if (progress.includes('전송')) {
      return messages[0] + messages[1] + `<span style="color: #737373;">${progress}</span>`;
    } else {
      return messages[0] + messages[1] + messages[2] + `<span style="color: #737373;">${progress}</span>`;
    }
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
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">제목</h3>
          <p style="color: #737373; line-height: 1.5;">${this.escapeHtml(block.title)}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">진위 판단</h3>
          <p style="color: #0D0D0D; background: #BF9780; padding: 12px; border-radius: 8px; font-weight: 500;">${this.escapeHtml(verdict)}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">근거</h3>
          <p style="color: #737373; line-height: 1.5; background: #F2F2F2; border: 1px solid #BF9780; padding: 12px; border-radius: 8px;">${this.escapeHtml(evidence)}</p>
        </div>
        
        <div>
          <h3 style="color: #0D0D0D; font-weight: 600; margin-bottom: 8px;">상세 분석</h3>
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
        
        console.log('Settings button clicked'); // 디버깅용
        
        if (document.getElementById('api-key-input-modal')) {
          console.log('Modal already exists'); // 디버깅용
          return;
        }
        
        this.checkSavedApiKey().then((savedApiKey) => {
          console.log('Creating settings modal with API key:', savedApiKey ? 'exists' : 'none'); // 디버깅용
          const modal = this.createSettingsModal(savedApiKey);
          document.body.appendChild(modal);
          
          // 강제로 스타일 적용
          modal.style.display = 'flex';
          modal.style.visibility = 'visible';
          
          setTimeout(() => {
            modal.style.opacity = '1';
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
              modalContent.style.transform = 'scale(1)';
            }
            console.log('Modal animation completed'); // 디버깅용
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
      z-index: 2147483648;
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
          if (this.isChromeApiAvailable()) {
            try {
              chrome.storage.local.set({ apiKey: apiKey }, () => {
                if (chrome.runtime.lastError) {
                  console.log('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
                  localStorage.setItem('gemini_api_key', apiKey);
                  alert('API 키가 저장되었습니다! (localStorage)');
                } else {
                  alert('API 키가 저장되었습니다!');
                }
                closeModal();
              });
            } catch (error) {
              console.log('Chrome storage error, using localStorage:', error);
              localStorage.setItem('gemini_api_key', apiKey);
              alert('API 키가 저장되었습니다! (localStorage)');
              closeModal();
            }
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
      if (this.isChromeApiAvailable()) {
        return new Promise((resolve) => {
          chrome.storage.local.get(['apiKey'], (result) => {
            if (chrome.runtime.lastError) {
              console.log('Chrome storage failed, using localStorage:', chrome.runtime.lastError);
              resolve(localStorage.getItem('gemini_api_key') || '');
            } else {
              resolve(result.apiKey || '');
            }
          });
        });
      } else {
        return localStorage.getItem('gemini_api_key') || '';
      }
    } catch (error) {
      console.log('API 키 확인 오류:', error);
      return localStorage.getItem('gemini_api_key') || '';
    }
  }

  // 분석 진행 상황 업데이트 (외부에서 호출)
  updateAnalysisProgress(blockId, progress) {
    this.updateNewsStatus(blockId, 'analyzing', null, progress);
  }

  // 스트리밍 결과 업데이트 (실시간 타이핑 효과)
  updateStreamingResult(blockId, partialResult) {
    this.streamingResults.set(blockId, partialResult);
    this.updateNewsStatus(blockId, 'analyzing', null, 'AI가 분석 중... (클릭하여 실시간 보기)');
    
    // 현재 열려있는 실시간 모달이 있다면 업데이트
    const existingModal = document.querySelector(`[data-streaming-modal="${blockId}"]`);
    if (existingModal) {
      this.updateStreamingModal(existingModal, partialResult);
    }
  }

  // 분석 완료 (외부에서 호출)
  completeAnalysis(blockId, result) {
    // 실시간 모달이 열려있다면 완료 메시지 표시 후 닫기
    const streamingModal = document.querySelector(`[data-streaming-modal="${blockId}"]`);
    if (streamingModal) {
      const contentDiv = streamingModal.querySelector('.streaming-content');
      if (contentDiv) {
        contentDiv.innerHTML = `
          ${this.streamingResults.get(blockId) || ''}
          <div style="margin-top: 20px; padding: 15px; background: #e7f5e7; border: 1px solid #4CAF50; border-radius: 8px; color: #2e7d32; text-align: center;">
            <strong>분석이 완료되었습니다!</strong><br>
            <small style="color: #666;">분석 기록에서 결과를 확인할 수 있습니다</small>
          </div>
        `;
        
        // 스크롤을 맨 아래로
        const scrollContainer = contentDiv.parentElement;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
      
      // 1.5초 후 모달 자동 닫기
      setTimeout(() => {
        streamingModal.style.opacity = '0';
        setTimeout(() => {
          streamingModal.remove();
          
          // 닫힌 후 해당 뉴스 블록에 완료 표시 강조 (잠깐 깜빡임)
          this.highlightCompletedBlock(blockId);
        }, 300);
      }, 1500);
    }
    
    this.streamingResults.delete(blockId); // 스트리밍 결과 정리
    this.updateNewsStatus(blockId, 'completed', result);
  }

  // 완료된 블록 강조 표시
  highlightCompletedBlock(blockId) {
    const newsBlocks = this.panelContent.querySelectorAll('.news-block');
    newsBlocks.forEach(block => {
      if (block.dataset.id === blockId) {
        // 잠깐 초록색 테두리로 강조
        block.style.border = '2px solid #4CAF50';
        block.style.backgroundColor = '#f8fff8';
        block.style.transform = 'scale(1.02)';
        
        setTimeout(() => {
          block.style.border = '';
          block.style.backgroundColor = '';
          block.style.transform = '';
        }, 2000);
      }
    });
  }

  // 분석 실패 (외부에서 호출)
  failAnalysis(blockId, error) {
    this.streamingResults.delete(blockId); // 스트리밍 결과 정리
    this.updateNewsStatus(blockId, 'error', null, null, error);
  }

  // 뉴스 블록 데이터 저장
  saveNewsBlocks() {
    const blocksData = Array.from(this.newsBlocks.entries()).map(([id, block]) => [id, block]);
    const dataToSave = {
      blocks: blocksData,
      counter: this.blockIdCounter
    };
    
    // Chrome API 안전 확인
    if (this.isChromeApiAvailable()) {
      try {
        chrome.storage.local.set({ newsBlocks: dataToSave }, () => {
          if (chrome.runtime.lastError) {
            console.log('Chrome storage failed, falling back to localStorage:', chrome.runtime.lastError);
            this.saveToLocalStorage(dataToSave);
          } else {
            console.log('News blocks saved to chrome storage');
          }
        });
      } catch (error) {
        console.log('Chrome storage error, using localStorage:', error);
        this.saveToLocalStorage(dataToSave);
      }
    } else {
      this.saveToLocalStorage(dataToSave);
    }
  }

  // localStorage에 저장
  saveToLocalStorage(dataToSave) {
    try {
      localStorage.setItem('factcheck_news_blocks', JSON.stringify(dataToSave));
      console.log('News blocks saved to localStorage');
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }

  // Chrome API 사용 가능 여부 확인
  isChromeApiAvailable() {
    try {
      return typeof chrome !== 'undefined' && 
             chrome.runtime && 
             chrome.runtime.id && 
             chrome.storage && 
             chrome.storage.local;
    } catch (error) {
      return false;
    }
  }

  // 저장된 뉴스 블록 데이터 로드
  loadSavedNewsBlocks() {
    if (this.isChromeApiAvailable()) {
      try {
        chrome.storage.local.get(['newsBlocks'], (result) => {
          if (chrome.runtime.lastError) {
            console.log('Chrome storage failed, falling back to localStorage:', chrome.runtime.lastError);
            this.loadFromLocalStorage();
          } else if (result.newsBlocks) {
            this.restoreNewsBlocks(result.newsBlocks);
            this.updatePanel();
          } else {
            // Chrome storage에 데이터가 없으면 localStorage도 확인
            this.loadFromLocalStorage();
          }
        });
      } catch (error) {
        console.log('Chrome storage error, using localStorage:', error);
        this.loadFromLocalStorage();
      }
    } else {
      this.loadFromLocalStorage();
    }
  }

  // localStorage에서 로드
  loadFromLocalStorage() {
    try {
      const savedData = localStorage.getItem('factcheck_news_blocks');
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        this.restoreNewsBlocks(parsedData);
        this.updatePanel();
      }
    } catch (error) {
      console.error('Error parsing saved news blocks:', error);
    }
  }

  // 뉴스 블록 데이터 복원
  restoreNewsBlocks(savedData) {
    if (savedData && savedData.blocks) {
      this.newsBlocks = new Map(savedData.blocks);
      this.blockIdCounter = savedData.counter || 0;
      console.log('Restored', this.newsBlocks.size, 'news blocks');
    }
  }
}

// Export for use in content_script.js
window.AnalysisPanel = AnalysisPanel;
