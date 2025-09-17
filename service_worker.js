// service_worker.js

// Chrome API 안전 확인 함수
function isChromeApiAvailable() {
  try {
    return chrome && chrome.runtime && chrome.runtime.id;
  } catch (error) {
    return false;
  }
}

// content_script로부터 메시지를 수신하는 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzeNewsWithGemini") {
    console.log("Content Script로부터 뉴스 분석 요청을 받았습니다. blockId:", message.blockId);
    
    // 확장 컨텍스트 확인
    if (!isChromeApiAvailable()) {
      console.error("Extension context invalidated");
      sendResponse({ status: "확장 컨텍스트 오류", error: "확장이 비활성화되었습니다." });
      return;
    }
    
    // 저장된 API 키 가져오기
    try {
      chrome.storage.local.get(['apiKey'], (result) => {
        if (chrome.runtime.lastError) {
          console.error("API 키 로드 오류:", chrome.runtime.lastError);
          sendResponse({ status: "저장소 오류", error: chrome.runtime.lastError.message });
          return;
        }
        
        const API_KEY = result.apiKey;
        
        if (!API_KEY) {
          console.error("API 키가 설정되지 않았습니다.");
          if (isChromeApiAvailable()) {
            chrome.tabs.sendMessage(sender.tab.id, {
              action: "displayError",
              error: "API 키가 설정되지 않았습니다. 설정 버튼을 클릭하여 API 키를 입력해주세요.",
              blockId: message.blockId
            }).catch(error => console.error("메시지 전송 오류:", error));
          }
          sendResponse({ status: "API 키 없음", error: "API 키가 설정되지 않았습니다." });
          return;
        }
        
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
        
        // Gemini API 호출 함수 실행 (스트리밍 방식)
        callGeminiAPIWithStreaming(message.prompt, API_URL, sender.tab.id, message.blockId)
          .then(result => {
            console.log("--- Gemini API 스트리밍 완료 ---");
            console.log(result);
            
            // 최종 결과를 content script로 다시 전송 (blockId 포함)
            if (isChromeApiAvailable()) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "displayAnalysisResult",
                result: result,
                blockId: message.blockId
              }).catch(error => console.error("결과 전송 오류:", error));
            }
            
            sendResponse({ status: "분석 완료 및 결과 전송 성공" });
          })
          .catch(error => {
            console.error("Gemini API 처리 중 오류 발생:", error);
            
            // 오류를 content script로 전송 (blockId 포함)
            if (isChromeApiAvailable()) {
              chrome.tabs.sendMessage(sender.tab.id, {
                action: "displayError",
                error: error.message,
                blockId: message.blockId
              }).catch(sendError => console.error("오류 전송 실패:", sendError));
            }
            
            sendResponse({ status: "API 처리 오류", error: error.message });
          });
      });
    } catch (error) {
      console.error("저장소 접근 오류:", error);
      sendResponse({ status: "저장소 오류", error: error.message });
    }

    // 비동기 응답을 위해 true를 반환
    return true; 
  }
});

/**
 * Gemini API를 스트리밍 방식으로 호출하는 비동기 함수
 * @param {string} prompt - API에 전송할 전체 프롬프트
 * @param {string} apiUrl - API URL (키 포함)
 * @param {number} tabId - 탭 ID
 * @param {string} blockId - 블록 ID
 * @returns {Promise<string>} - API가 반환한 최종 텍스트 결과
 */
async function callGeminiAPIWithStreaming(prompt, apiUrl, tabId, blockId) {
  try {
    // 일단 기본 API로 전체 결과를 받은 후 타이핑 효과 시뮬레이션
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`API 요청 실패: ${response.status} ${response.statusText} - ${JSON.stringify(errorBody)}`);
    }

    const data = await response.json();
    const fullResult = extractNewsContent(data);
    
    // 결과를 문자 단위로 타이핑 효과 시뮬레이션
    if (typeof fullResult === 'string') {
      await simulateTypingEffect(fullResult, tabId, blockId);
    } else {
      // JSON 객체인 경우 문자열로 변환 후 타이핑 효과
      const resultString = JSON.stringify(fullResult, null, 2);
      await simulateTypingEffect(resultString, tabId, blockId);
    }

    return fullResult;
  } catch (error) {
    console.error("API 호출 오류:", error);
    throw error;
  }
}

/**
 * 타이핑 효과 시뮬레이션
 * @param {string} text - 전체 텍스트
 * @param {number} tabId - 탭 ID
 * @param {string} blockId - 블록 ID
 */
async function simulateTypingEffect(text, tabId, blockId) {
  const words = text.split(' ');
  let currentText = '';
  
  for (let i = 0; i < words.length; i++) {
    currentText += (i > 0 ? ' ' : '') + words[i];
    
    // 단어별로 실시간 업데이트 전송 (안전 확인)
    if (isChromeApiAvailable()) {
      try {
        chrome.tabs.sendMessage(tabId, {
          action: "updateStreamingResult",
          partialResult: currentText,
          blockId: blockId
        }).catch(error => {
          console.error("스트리밍 메시지 전송 오류:", error);
        });
      } catch (error) {
        console.error("Chrome API 호출 오류:", error);
        break; // 오류 발생 시 루프 중단
      }
    }
    
    // 타이핑 속도 조절 (단어 길이에 따라 조절)
    const delay = Math.max(50, Math.min(200, words[i].length * 20));
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Gemini API 응답에서 뉴스 콘텐츠를 추출하는 함수
 * @param {object} data - Gemini API의 JSON 응답
 * @returns {object|string} - 분석 결과 객체 또는 오류 메시지
 */
function extractNewsContent(data) {
  try {
    // candidates 배열에서 첫 번째 content.parts[0].text 추출
    let resultText = '';
    if (data.candidates && data.candidates.length > 0) {
      const content = data.candidates[0].content;
      if (content.parts && content.parts.length > 0) {
        resultText = content.parts[0].text;
      }
    }
    
    // 코드블록 제거
    resultText = resultText.replace(/```json|```/g, '').trim();
    
    // JSON 파싱 시도
    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch (e) {
      // 객체만 파싱 시도
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    }
    
    // 배열이면 첫 번째 객체의 output 사용
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].output) {
      return parsed[0].output;
    }
    
    // 객체에 output 있으면 사용
    if (parsed && parsed.output) {
      return parsed.output;
    }
    
    // 객체에 진위/근거/분석 있으면 사용
    if (parsed && parsed.진위) {
      return {
        진위: parsed.진위,
        근거: parsed.근거 || '',
        분석: parsed.분석 || ''
      };
    }
    
    // 파싱 실패 시 원본 텍스트 반환
    return resultText;
  } catch (error) {
    return {
      진위: '분석 오류',
      근거: '',
      분석: 'JSON 파싱 오류: ' + error.message
    };
  }
}