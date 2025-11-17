// SelfFeedbackModule.js - 자기 피드백 루프 모듈

/**
 * 자기 피드백 루프 (Self-Feedback Loop)
 * 
 * AI 분석 결과를 재귀적으로 검증하여 정확도를 높이는 모듈
 * 
 * 동작 원리:
 * 1. 1차 분석 결과를 기준점으로 설정
 * 2. N회 반복하여 이전 검증 결과를 재검토
 * 3. 매 단계마다 원문 기반으로 독립적 재평가
 * 4. 최종 검증 결과를 분석 결과로 확정
 * 
 * @class SelfFeedbackModule
 */
class SelfFeedbackModule {
  constructor(analysisPanel) {
    this.panel = analysisPanel;
    this.defaultDepth = 3; // 기본 검증 깊이 (최소 2, 최대 4)
    this.enabled = false; // 기본 비활성화
  }

  /**
   * 자기 피드백 루프 활성화 여부 확인
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * 자기 피드백 루프 활성화/비활성화
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    console.log(`[자기 피드백 루프] ${this.enabled ? '활성화' : '비활성화'}`);
  }

  /**
   * 검증 깊이 설정
   * @param {number} depth - 검증 반복 횟수 (2-4)
   */
  setDepth(depth) {
    this.defaultDepth = Math.max(2, Math.min(4, depth));
    console.log(`[자기 피드백 루프] 검증 깊이: ${this.defaultDepth}회`);
  }

  /**
   * 검증 깊이 가져오기
   * @returns {number}
   */
  getDepth() {
    return this.defaultDepth;
  }

  /**
   * 재귀적 검증 시작
   * @param {number} blockId - 블록 ID
   * @param {Object} block - 뉴스 블록 데이터
   * @param {AbortController} abortController - 취소 컨트롤러
   */
  async performRecursiveVerification(blockId, block, abortController) {
    if (!this.enabled) {
      console.log(`[자기 피드백 루프] 비활성화 상태로 검증 스킵, ID: ${blockId}`);
      return;
    }

    const depth = this.defaultDepth;
    const currentStep = block.currentVerificationStep + 1;
    
    console.log(`[재귀 검증] ${currentStep}/${depth}차 검증 시작, ID: ${blockId}`);
    
    // 진행 상태 메시지
    const progressMessages = [
      `🔄 ${currentStep}/${depth}차 검증 준비 중...`,
      `🧐 ${currentStep}/${depth}차 재검토 수행 중...`,
      `🔍 ${currentStep}/${depth}차 교차 검증 중...`,
      `⚡ ${currentStep}/${depth}차 메타인지적 재평가 중...`
    ];
    
    // 상태 업데이트 (순차적 메시지)
    for (let i = 0; i < progressMessages.length; i++) {
      await new Promise(resolve => setTimeout(resolve, i === 0 ? 0 : 400));
      this.panel.updateNewsStatus(blockId, 'analyzing', null, progressMessages[i]);
    }
    
    // 모든 이전 검증 결과 가져오기 (누적 컨텍스트)
    const allPreviousResults = block.verificationHistory ? [...block.verificationHistory] : [];
    
    // 사실 검증 결과 가져오기
    const factCheckData = block.factCheckResult ? {
      articles: block.factCheckResult.articles,
      verification: block.factCheckResult.verification,
      timestamp: block.factCheckResult.timestamp
    } : null;
    
    // 교차 검증 프롬프트 생성 (누적 방식)
    const crossVerifyPrompt = this.generateCrossVerificationPrompt(
      block.title,
      block.content,
      block.baselineAnalysis,
      allPreviousResults,
      currentStep,
      depth,
      factCheckData
    );
    
    console.log(`[재귀 검증] ${currentStep}/${depth}차 API 요청 전송, blockId: ${blockId}`);
    
    // API 요청 전송
    chrome.runtime.sendMessage({
      action: "analyzeNewsWithGemini",
      prompt: crossVerifyPrompt,
      blockId: blockId,
      isCrossVerification: true,
      verificationStep: currentStep,
      verificationDepth: depth,
      signal: abortController.signal
    });
  }

  /**
   * 교차 검증 프롬프트 생성 (누적 컨텍스트 방식)
   * @param {string} title - 기사 제목
   * @param {string} content - 기사 본문
   * @param {Object} baselineAnalysis - 1차 분석 결과
   * @param {Array} allPreviousResults - 모든 이전 검증 결과 배열
   * @param {number} currentStep - 현재 검증 단계
   * @param {number} totalDepth - 전체 검증 깊이
   * @param {Object} factCheckData - 사실 검증 데이터
   */
  generateCrossVerificationPrompt(title, content, baselineAnalysis, allPreviousResults = [], currentStep = 1, totalDepth = 1, factCheckData = null) {
    const articleContent = `${title}\n${content}`;
    const dateTimeContext = this.panel.getDateTimeContext();
    
    // 사실 검증 정보 섹션
    let factCheckSection = '';
    if (factCheckData && factCheckData.articles && factCheckData.articles.length > 0) {
      factCheckSection = `

---

[사실 검증 결과 (외부 기사 비교)]

**검증된 기사 수: ${factCheckData.articles.length}개**

${factCheckData.articles.map((article, index) => `
**비교 기사 ${index + 1}:**
- 제목: ${article.title}
- 출처: ${article.displayLink}
- 요약: ${article.snippet}
${article.crawledContent ? `- 핵심 내용: ${article.crawledContent.substring(0, 300)}...` : '- 본문: (크롤링 실패)'}
`).join('\n')}

**AI 비교 검증 결과:**
- ✅ 일치: ${factCheckData.verification?.일치하는_사실?.length || 0}개
- ❌ 불일치: ${factCheckData.verification?.불일치하는_사실?.length || 0}개
- 평가: ${factCheckData.verification?.종합_평가 || 'N/A'}

**[참고]** 위 검증 결과는 이미 AI가 분석 완료했으므로, 교차 검증 시 참고만 하세요.

---`;
    }
    
    // 첫 번째 검증
    if (currentStep === 1) {
      return `
${dateTimeContext}

## 역할
당신은 **'AI 분석 검증 전문가'**입니다. 다른 AI가 수행한 뉴스 분석 결과를 재검토하고, 오류나 과도한 판단이 있는지 교차 검증하는 것이 당신의 임무입니다.

---

### **교차 검증 원칙**
1. **독립적 재평가**: 1차 분석 결과에 영향받지 않고 원문을 다시 독립적으로 평가
2. **오판 가능성 점검**: 1차 분석이 놓친 맥락이나 과도한 판단이 있는지 확인
3. **근거의 타당성 재검토**: 제시된 근거가 실제로 원문에 존재하고 타당한지 검증
4. **False Positive 방지**: 정상적인 기사를 가짜 뉴스로 오판하지 않았는지 특별히 주의
5. **최종 균형 판단**: 1차 분석과 재평가를 종합하여 더 정확하고 신중한 결론 도출

---

### **검증 체크리스트**
□ 1차 분석에서 제시한 근거가 실제로 원문에 존재하는가?
□ 전문 용어나 업계 표현을 "모호한 표현"으로 오인하지 않았는가?
□ 기사 장르(속보/칼럼/인터뷰/탐사보도)의 특성을 고려했는가?
□ 부정적 내용을 "가짜 뉴스"로 오판하지 않았는가?
□ 인용문과 기자의 주장을 명확히 구분했는가?
□ 감정 표현이 사건의 심각성에 비례하는 적절한 수준인가?
□ 1차 분석의 판정이 너무 가혹하거나 너무 관대하지 않은가?

---

## 출력 형식

**[중요] 텍스트 포맷팅 문법:**
- **줄바꿈**: <br> 태그, **강조**: **텍스트**, **제목**: ## 제목, **리스트**: - 항목 또는 1. 항목

[
  {
    "instruction": "아래는 동일한 기사에 대한 1차 AI 분석 결과입니다. 이를 참고하되, 원문을 독립적으로 재평가하여 최종 판단을 내리세요.",
    "input": "원문 기사 + 1차 분석 결과",
    "output": {
      "진위": "교차 검증 후 최종 판단 ('거짓' / '대체로 거짓' / '일부 사실' / '대체로 사실' / '사실'만 사용. '진짜 뉴스', '가짜 뉴스' 등 다른 표현 절대 금지)",
      "근거": "최종 판단의 근거를 나열",
      "분석": "다음 구조로 가독성 높게 작성하세요:<br><br>**✨ 기사 개요**<br>기사가 다루는 핵심 내용을 1-2문장으로 간단히 정리<br><br>**📊 주요 분석 결과**<br>위 근거에서 발견된 핵심 문제점 또는 신뢰할 수 있는 요소를 항목별로 명확히 설명<br><br>**⚠️ 검증 한계**<br>(있다면) 현재 검증으로는 확인 불가능한 정보나 추가 확인이 필요한 부분을 간단히 언급<br><br>**⚖️ 종합 판단**<br>위 내용을 바탕으로 최종 신뢰도 평가와 그 이유를 2-3문장으로 명확히 정리<br><br>※ 각 섹션은 <br><br>로 구분하고, 섹션 제목은 이모지+굵은 글씨(**텍스트**)로 표시하세요",
      "요약": "교차 검증을 거친 최종 결론을 간결하게 요약",
      "검증의견": "1차 분석과 비교하여 달라진 점, 보완된 점, 또는 동의하는 이유를 명시"
    }
  }
]

---

[원문 기사]
${articleContent}
${factCheckSection}

[1차 AI 분석 결과]
진위: ${baselineAnalysis.진위 || 'N/A'}
근거: ${baselineAnalysis.근거 || 'N/A'}
분석: ${baselineAnalysis.분석 || 'N/A'}
요약: ${baselineAnalysis.요약 || 'N/A'}

---

**[검증 요청]**
위 1차 분석 결과를 원문 기사와 대조하여 재검증해주세요.

---`;
    }
    
    // 2차 이상의 재귀적 검증 (누적 컨텍스트)
    // 누적된 모든 이전 검증 결과를 포함
    const previousVerificationsText = allPreviousResults.map((result, index) => `
[${index + 1}차 검증 결과]
진위: ${result.진위 || 'N/A'}
근거: ${result.근거 || 'N/A'}
분석: ${result.분석 || 'N/A'}
요약: ${result.요약 || 'N/A'}
검증의견: ${result.검증의견 || 'N/A'}
`).join('\n---\n');

    return `
${dateTimeContext}

## 역할
당신은 **'재귀적 검증 전문가'**입니다. 이전 AI의 검증 결과들을 모두 검토하여, 판단의 정확도를 더욱 높이는 것이 당신의 임무입니다.

**현재 진행 상황: ${currentStep}/${totalDepth}차 검증**
**참고 자료: 원문 + 1차 분석 + ${allPreviousResults.length}개의 이전 검증 결과**

---

### **재귀적 검증 원칙**
1. **원문 기반 재평가**: 항상 원문을 기준점으로 하여 이전 검증들이 원문의 실제 내용과 일치하는지 확인
2. **1차 분석 참조**: 초기 AI 분석이 제시한 관점을 염두에 두되, 맹신하지 않기
3. **이전 검증의 맹점 탐색**: 직전 검증에서 놓쳤을 수 있는 세부사항을 집중적으로 재검토
4. **자기 강화적 피드백**: 이전 판단을 무조건 수용하지 않고, 원문 기반으로 독립적 재평가
5. **점진적 정밀화**: 매 단계마다 판단의 근거와 논리를 더욱 정교하게 다듬기
6. **과잉 수정 방지**: 이전 검증이 타당하다면 불필요하게 뒤집지 않고 보강만 하기

---

### **재검증 체크리스트**
□ 직전 검증의 판단 근거가 원문과 정확히 일치하는가?
□ 1차 분석과 직전 검증 사이에 일관성이 있는가?
□ 원문에서 간과한 중요한 맥락이나 뉘앙스가 있는가?
□ 이전 검증들의 결론이 지나치게 확신적이거나 모호하지 않은가?
□ 감정적 표현과 객관적 사실을 명확히 구분했는가?
□ 기사의 장르와 의도를 충분히 고려했는가?
□ 인용문의 출처와 신뢰성을 재확인했는가?
□ 최종 판단이 원문의 전체 맥락과 일관되는가?

---

## 출력 형식

**[중요] 텍스트 포맷팅 문법:**
- **줄바꿈**: <br> 태그, **강조**: **텍스트**, **제목**: ## 제목, **리스트**: - 항목 또는 1. 항목

[
  {
    "instruction": "아래는 동일한 기사에 대한 1차 분석 및 ${allPreviousResults.length}개의 검증 결과입니다. 원문을 기준점으로 모든 결과를 누적 검토하여 더 정확한 판단을 내리세요.",
    "input": "원문 기사 + 1차 분석 결과 + ${allPreviousResults.length}개의 검증 결과",
    "output": {
      "진위": "${currentStep}차 재귀적 검증 후 최종 판단 ('거짓' / '대체로 거짓' / '일부 사실' / '대체로 사실' / '사실'만 사용. '진짜 뉴스', '가짜 뉴스' 등 다른 표현 절대 금지)",
      "근거": "최종 판단의 근거를 나열",
      "분석": "다음 구조로 가독성 높게 작성하세요:<br><br>**✨ 기사 개요**<br>기사가 다루는 핵심 내용을 1-2문장으로 간단히 정리<br><br>**📊 주요 분석 결과**<br>위 근거에서 발견된 핵심 문제점 또는 신뢰할 수 있는 요소를 항목별로 명확히 설명<br><br>**⚠️ 검증 한계**<br>(있다면) 현재 검증으로는 확인 불가능한 정보나 추가 확인이 필요한 부분을 간단히 언급<br><br>**⚖️ 종합 판단**<br>위 내용을 바탕으로 최종 신뢰도 평가와 그 이유를 2-3문장으로 명확히 정리<br><br>※ 각 섹션은 <br><br>로 구분하고, 섹션 제목은 이모지+굵은 글씨(**텍스트**)로 표시하세요",
      "요약": "${currentStep}차 재귀적 검증을 거친 최종 결론을 간결하게 요약",
      "검증의견": "1차 분석 및 이전 ${allPreviousResults.length}개의 검증 결과와 비교하여 달라진 점, 보완된 점, 또는 동의하는 이유를 명시. 각 검증 단계에서 발견된 통찰을 누적적으로 반영."
    }
  }
]

---

[원문 기사]
${articleContent}
${factCheckSection}

[1차 AI 분석 결과 (기준점)]
진위: ${baselineAnalysis.진위 || 'N/A'}
근거: ${baselineAnalysis.근거 || 'N/A'}
분석: ${baselineAnalysis.분석 || 'N/A'}
요약: ${baselineAnalysis.요약 || 'N/A'}

---

${previousVerificationsText}

---

**[검증 요청]**
위 원문, 1차 분석, 그리고 ${allPreviousResults.length}개의 이전 검증 결과를 모두 종합하여 ${currentStep}차 재검증을 수행해주세요.
각 검증 단계에서 발견된 내용을 누적적으로 반영하되, 원문을 최우선 기준점으로 삼아주세요.

---`;
  }

  /**
   * 교차 검증 결과 처리
   * @param {number} blockId
   * @param {Object} crossVerifiedResult
   * @param {boolean} isCurrentBlock
   */
  handleCrossVerificationResult(blockId, crossVerifiedResult, isCurrentBlock = false) {
    const block = isCurrentBlock ? this.panel.currentNews : this.panel.newsBlocks.get(blockId);
    
    if (!block) {
      console.error('블록을 찾을 수 없음, ID:', blockId);
      return;
    }
    
    // 현재 단계 증가
    block.currentVerificationStep = (block.currentVerificationStep || 0) + 1;
    
    // 검증 결과를 히스토리에 저장
    if (!block.verificationHistory) {
      block.verificationHistory = [];
    }
    block.verificationHistory.push(crossVerifiedResult);
    
    console.log(`[교차 검증] ${block.currentVerificationStep}/${this.defaultDepth}차 검증 완료`);
    
    // 모든 검증 단계가 완료되었는지 확인
    if (block.currentVerificationStep >= this.defaultDepth) {
      // 최종 검증 완료
      this.finalizeCrossVerification(blockId, block, isCurrentBlock);
    } else {
      // 다음 단계 검증 계속 진행
      const abortController = this.panel.abortControllers.get(blockId);
      this.performRecursiveVerification(blockId, block, abortController);
    }
  }

  /**
   * 최종 검증 완료 처리
   */
  finalizeCrossVerification(blockId, block, isCurrentBlock = false) {
    console.log(`[교차 검증] 모든 검증 완료, ID: ${blockId}, 총 ${block.currentVerificationStep}차 검증`);
    
    // 교차 검증 플래그 설정
    block.crossVerified = true;
    
    // 최종 검증 결과 저장
    const finalResult = block.verificationHistory[block.verificationHistory.length - 1];
    block.crossVerifiedResult = finalResult;
    
    // 상태를 completed로 변경하고 최종 결과로 업데이트
    block.status = 'completed';
    block.result = finalResult;
    
    // 분석 패널에 완료 알림
    this.panel.onSelfFeedbackComplete(blockId, block, finalResult, isCurrentBlock);
  }
}

// 전역 스코프에 노출
if (typeof window !== 'undefined') {
  window.SelfFeedbackModule = SelfFeedbackModule;
}
