/**
 * 뉴스 분석 과정을 처리하는 스크립트 (AI API 시뮬레이션 연동 버전)
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log("[ProcessingJS] DOMContentLoaded event fired (AI Sim Integrated Version).");

    const processingBody = document.getElementById('processing-body');
    const resultContainer = document.getElementById('result-container');
    const loadingIndicator = document.getElementById('loading-indicator');
    const thoughtsList = document.getElementById('ai-thoughts-list'); // AI 생각 표시는 이제 사용 안 함
    const statusMessage = document.getElementById('status-message');
    const errorMessageDiv = document.getElementById('error-message');
    const aiStatusContainer = document.getElementById('ai-status-container'); // 이것도 크게 의미 없어짐

    if (!processingBody || !resultContainer || !loadingIndicator || !statusMessage || !errorMessageDiv || !aiStatusContainer) {
        console.error("[ProcessingJS] Error: One or more essential HTML elements are missing in processing.html.");
        if (loadingIndicator) loadingIndicator.innerHTML = "<p>페이지 로딩 오류 발생. 필수 요소 누락.</p>";
        return;
    }

    const newsText = processingBody.dataset.newsText;
    const articleTitle = processingBody.dataset.articleTitle || "제목 없음";
    
    console.log(`[ProcessingJS] Initializing 'analysis' process. Title: "${articleTitle.substring(0,50)}...", Text length: ${newsText ? newsText.length : 0}`);
    
    if (thoughtsList) thoughtsList.innerHTML = ''; 
    if (errorMessageDiv) {
        errorMessageDiv.textContent = '';
        errorMessageDiv.style.display = 'none';
    }
    if (statusMessage) statusMessage.textContent = '입력된 내용을 처리 중입니다. 잠시만 기다려 주세요...';
    
    if (aiStatusContainer) aiStatusContainer.style.display = 'block'; // 일단은 표시하나, 내용은 상태 메시지가 주도
    if (resultContainer) resultContainer.style.display = 'none';
    if (loadingIndicator) loadingIndicator.style.display = 'flex';

    let eventSource = null;

    try {
        const eventSourceUrl = `/get_analysis_stream?news_text_data=${encodeURIComponent(newsText || "")}&article_title_data=${encodeURIComponent(articleTitle)}`;
        console.log("[ProcessingJS] Creating EventSource for:", eventSourceUrl);
        eventSource = new EventSource(eventSourceUrl);

        eventSource.onopen = function(event) {
            console.log("[ProcessingJS] SSE Connection OPENED successfully!", event);
        };

        eventSource.addEventListener('status', function(event) {
            try {
                const data = JSON.parse(event.data);
                console.log('[ProcessingJS] SSE Status:', data.step);
                if (statusMessage) statusMessage.textContent = data.step;
                // AI thoughts list는 더 이상 직접 업데이트하지 않음
                if (thoughtsList && data.thought_html) { // 만약 서버가 thought_html을 보낸다면
                    // const thoughtItem = document.createElement('li');
                    // thoughtItem.innerHTML = data.thought_html; // 서버에서 HTML로 보내준다면
                    // thoughtsList.appendChild(thoughtItem);
                    // thoughtsList.scrollTop = thoughtsList.scrollHeight;
                } else if (thoughtsList && data.step && aiStatusContainer.style.display === 'block') {
                    // 상태 메시지를 ai-thoughts-list에도 간략히 표시 (선택적)
                    // const statusAsThought = document.createElement('li');
                    // statusAsThought.textContent = data.step;
                    // thoughtsList.appendChild(statusAsThought);
                }

            } catch (e) {
                console.error("[ProcessingJS] Error parsing status event data:", e, event.data);
            }
        });
        
        // 'thought' 이벤트 리스너는 제거하거나 비워둠 (현재 서버에서 사용 안 함)
        // eventSource.addEventListener('thought', function(event) { ... });

        eventSource.addEventListener('final_data', function(event) {
            console.log("[ProcessingJS] Received 'final_data' event. Closing EventSource.");
            if (eventSource) {
                eventSource.close();
            }

            try {
                const data = JSON.parse(event.data);
                console.log("[ProcessingJS] Parsed final data:", data);

                if (!data || typeof data !== 'object') {
                    handleError("오류: 서버로부터 유효하지 않은 최종 분석 데이터를 받았습니다.");
                    return;
                }
                
                hideLoadingIndicator();

                if (resultContainer) {
                    resultContainer.innerHTML = createResultHtml(data); 
                    resultContainer.style.display = 'block';
                    updateBodyStyleForResult();
                    loadCommonScript(); // 메뉴 등 공통 UI 스크립트 로드
                } else {
                    handleError("오류: 결과를 표시할 영역을 찾을 수 없습니다.");
                }

            } catch (e) {
                console.error("[ProcessingJS] Error processing final data:", e, event.data);
                handleError(`오류: 최종 결과를 처리하는 중 문제가 발생했습니다. (${e.message})`);
            }
        });

        eventSource.addEventListener('error', function(event) {
            console.error('[ProcessingJS] SSE Error event received:', event);
            let errorMessageText = "처리 중 서버와 연결 오류가 발생했습니다.";
            let serverMessage = null;

            // event.data를 파싱하여 서버가 보낸 오류 메시지 확인 시도
            if(event.data) {
                try {
                    const errorData = JSON.parse(event.data);
                    if(errorData && errorData.message) {
                        serverMessage = errorData.message;
                        // 서버 메시지가 있다면 그것을 우선적으로 사용
                        errorMessageText = `서버 오류: ${errorData.message}`;
                        // 서버에서 보낸 simulated_ai_result가 있다면 그것으로 화면 구성 시도
                        if (errorData.simulated_ai_result && resultContainer) {
                             console.warn("[ProcessingJS] SSE error contained simulated_ai_result. Displaying it.");
                             hideLoadingIndicator();
                             resultContainer.innerHTML = createResultHtml({ // data 객체 모방
                                score: 0,
                                article_title: articleTitle, // 기존 제목 사용
                                article_content_highlighted: `<p class="error-text">${escapeHtml(newsText || "내용 없음")}</p>`,
                                simulated_ai_result: errorData.simulated_ai_result,
                                error_message: errorMessageText
                             });
                             resultContainer.style.display = 'block';
                             updateBodyStyleForResult();
                             loadCommonScript();
                             if (eventSource) eventSource.close();
                             return; // 여기서 처리 종료
                        }
                    }
                } catch (e) {
                    console.warn("[ProcessingJS] Could not parse SSE error event data:", event.data);
                }
            }


            if (event.target && event.target.readyState === EventSource.CLOSED) {
                console.log("[ProcessingJS] SSE connection already closed or closing, ignoring potentially duplicate error event.");
                // 이미 final_data를 통해 오류가 전달되었을 수 있음.
                // 또는 사용자가 페이지를 떠나는 중일 수 있음.
                // 여기서 추가적인 handleError 호출을 피할 수 있음.
                return; 
            }
            if (!navigator.onLine) errorMessageText = "네트워크 연결이 끊어졌습니다.";
            
            handleError(errorMessageText); // 최종 오류 처리

            if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
                eventSource.close();
            }
        });

    } catch (err) {
        console.error("[ProcessingJS] Fatal error setting up EventSource or listeners:", err);
        handleError("데이터 스트리밍 설정 중 치명적인 오류가 발생했습니다.");
    }

    function hideLoadingIndicator() {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
    
    function updateBodyStyleForResult() {
        if (processingBody) {
            processingBody.style.display = 'block'; // 전체 컨테이너는 보이도록
            processingBody.style.justifyContent = '';
            processingBody.style.alignItems = '';
            processingBody.style.backgroundColor = '#ffffff'; // 결과 페이지 배경
            processingBody.style.color = '#333';       // 결과 페이지 텍스트
            
            // 로딩 인디케이터와 AI 상태 컨테이너는 숨기거나 제거
            if (aiStatusContainer) aiStatusContainer.style.display = 'none';
            if (loadingIndicator && loadingIndicator.parentNode) {
                 // loadingIndicator.parentNode.removeChild(loadingIndicator); // 이미 hideLoadingIndicator에서 처리
            }
            if (statusMessage && statusMessage.parentNode) { // 상태 메시지도 제거
                statusMessage.parentNode.removeChild(statusMessage);
            }
            
            processingBody.removeAttribute('id'); // processing 전용 스타일 회피
        }
    }

    function handleError(message) {
        console.error("[ProcessingJS] Handling error:", message);
        hideLoadingIndicator();
        if (aiStatusContainer) aiStatusContainer.style.display = 'none';
        if (statusMessage) { // 상태 메시지 영역에 에러 표시
            statusMessage.textContent = message;
            statusMessage.style.color = 'red';
            statusMessage.style.fontWeight = 'bold';
        }
        // errorMessageDiv는 별도로 사용하거나 statusMessage로 통합
        if (errorMessageDiv) { 
            errorMessageDiv.textContent = message;
            errorMessageDiv.style.display = 'block';
            errorMessageDiv.style.color = 'red';
            errorMessageDiv.style.padding = '10px';
            errorMessageDiv.style.border = '1px solid red';
            errorMessageDiv.style.backgroundColor = '#ffe0e0';
        }
        if (resultContainer) {
            resultContainer.style.display = 'none';
            resultContainer.innerHTML = '';
        }
    }

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return "";
        const str = String(unsafe);
        return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function createResultHtml(data) {
        const score = (data && typeof data.score === 'number') ? data.score : 0;
        const currentArticleTitle = (data && data.article_title) ? data.article_title : "제목 정보 없음"; 
        const highlightedContent = (data && data.article_content_highlighted) ? data.article_content_highlighted : `<p class="error-text">본문 내용을 표시할 수 없습니다.</p>`;
        
        // AI 시뮬레이션 결과
        const aiResult = data.simulated_ai_result;
        let veracityHtml = '<p>AI 분석 정보를 가져올 수 없습니다.</p>';
        if (aiResult) {
            veracityHtml = `
                <div class="ai-analysis-item">
                    <h4>AI 판단 (시뮬레이션)</h4>
                    <p><strong>진위:</strong> ${escapeHtml(aiResult['진위'] || 'N/A')}</p>
                </div>
                <div class="ai-analysis-item">
                    <p><strong>판단 근거:</strong></p>
                    <p class="ai-analysis-block">${escapeHtml(aiResult['근거'] || 'N/A').replace(/\n/g, '<br>')}</p>
                </div>
                <div class="ai-analysis-item">
                    <p><strong>세부 분석:</strong></p>
                    <p class="ai-analysis-block">${escapeHtml(aiResult['분석'] || 'N/A').replace(/\n/g, '<br>')}</p>
                </div>
            `;
        }

        let scoreDesc = data.error_message || '분석 정보 없음'; // 서버에서 온 에러 메시지를 우선 사용
        if (!data.error_message || data.error_message.includes("시뮬레이션")) { // 시뮬레이션 메시지일 경우 점수 기반 설명 사용
            if (score >= 70) scoreDesc = '이 뉴스는 비교적 신뢰할 만해 보입니다. (AI 시뮬레이션 기반)';
            else if (score >= 40) scoreDesc = '이 뉴스는 보통 수준의 신뢰도를 보입니다. 일부 확인이 필요할 수 있습니다. (AI 시뮬레이션 기반)';
            else scoreDesc = '이 뉴스는 주의가 필요해 보입니다. 신뢰도를 면밀히 검토하세요. (AI 시뮬레이션 기반)';
            if (aiResult && aiResult['진위'] === '판단 불가 (입력 오류)') {
                scoreDesc = "입력 내용에 오류가 있어 정확한 신뢰도 판단이 어렵습니다.";
            } else if (aiResult && aiResult['진위'] === '오류') {
                scoreDesc = "서버 오류로 신뢰도 판단이 어렵습니다.";
            }
        }


        return `
            <button id="menu-button" class="hamburger-btn"><span></span><span></span><span></span></button>
            <nav id="main-menu" class="main-nav"><ul><li><a href="/">홈으로</a></li></ul></nav>
            <header class="title"><h1 id="title_main">분석 결과</h1><hr id="title_line"></header>
            <main class="result-container-inner">
                <section class="score-section">
                    <h2>신뢰도 점수 (참고용)</h2>
                    <div class="score-display">${score}%</div>
                    <p class="score-description">${escapeHtml(scoreDesc)}</p>
                </section>
                <section class="title-section">
                    <h2>입력된 내용 제목</h2>
                    <h3 class="article-title">${currentArticleTitle}</h3>
                </section>
                <section class="content-section">
                    <h2>입력된 내용 본문</h2>
                    <div class="article-body">${highlightedContent}</div>
                </section>
                <section class="analysis-section ai-simulation-section">
                    <h2>가짜 뉴스 AI 분석 결과 (시뮬레이션)</h2>
                    <div class="analysis-details">${veracityHtml}</div>
                </section>
                <div class="back-button-container"><a href="/" class="back-button">다시 입력하기</a></div>
            </main>
        `;
    }

    function loadCommonScript() {
        const scriptSrc = '/static/script.js';
        let existingScript = document.querySelector(`script[src="${scriptSrc}"]`);
        if (existingScript) {
            existingScript.remove(); 
        }
        const commonScript = document.createElement('script');
        commonScript.src = scriptSrc;
        commonScript.defer = true; 
        document.body.appendChild(commonScript);
        console.log("[ProcessingJS] Common script (script.js) loaded dynamically.");
    }
});
