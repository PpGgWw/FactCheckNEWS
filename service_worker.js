// service_worker.js

// content_script로부터 메시지를 수신하는 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "analyzeNewsWithGemini") {
    console.log("Content Script로부터 뉴스 분석 요청을 받았습니다.");
    
    // 저장된 API 키 가져오기
    chrome.storage.local.get(['apiKey'], (result) => {
      const API_KEY = result.apiKey;
      
      if (!API_KEY) {
        console.error("API 키가 설정되지 않았습니다.");
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "displayError",
          error: "API 키가 설정되지 않았습니다. 설정 버튼을 클릭하여 API 키를 입력해주세요."
        });
        sendResponse({ status: "API 키 없음", error: "API 키가 설정되지 않았습니다." });
        return;
      }
      
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
      
      // Gemini API 호출 함수 실행
      callGeminiAPI(message.prompt, API_URL)
        .then(result => {
          console.log("--- Gemini API 응답 (핵심 문장) ---");
          console.log(result);
          
          // 결과를 content script로 다시 전송
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "displayAnalysisResult",
            result: result
          });
          
          sendResponse({ status: "분석 완료 및 결과 전송 성공" });
        })
        .catch(error => {
          console.error("Gemini API 처리 중 오류 발생:", error);
          
          // 오류를 content script로 전송
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "displayError",
            error: error.message
          });
          
          sendResponse({ status: "API 처리 오류", error: error.message });
        });
    });

    // 비동기 응답을 위해 true를 반환
    return true; 
  }
});

/**
 * Gemini API를 호출하는 비동기 함수
 * @param {string} prompt - API에 전송할 전체 프롬프트
 * @param {string} apiUrl - API URL (키 포함)
 * @returns {Promise<string>} - API가 반환한 텍스트 결과
 */
async function callGeminiAPI(prompt, apiUrl) {
  try {
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
    return extractNewsContent(data);
  } catch (error) {
    console.error("fetch 또는 API 호출 오류:", error);
    throw error; // 오류를 상위로 전파
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
    // JSON 배열 또는 객체 파싱
    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch (e) {
      // 배열이 아닌 경우 객체만 파싱 시도
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

/**
 * 테스트용: extractNewsContent 함수가 정상적으로 동작하는지 확인하는 함수
 */
function extractNewsContentTest() {
  // Gemini API의 응답을 흉내낸 샘플 데이터
  const sampleData = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: `[
                {
                  "instruction": "해당 기사는 진위 여부판단을 목적으로 수집되었습니다. 조건에 따라서 종합적으로 검토 후 판단 결과를 진위,근거,분석 항목으로 나누어 출력하세요.",
                  "input": "주어진 텍스트 전체",
                  "output": {
                    "진위": "진짜 뉴스",
                    "근거": "",
                    "분석": "이 뉴스는 논리적 구조와 근거 제시 방식이 명확하며, 외부 정보 없이도 신뢰할 수 있습니다."
                  }
                }
              ]`
            }
          ]
        }
      }
    ]
  };
  return extractNewsContent(sampleData);
}