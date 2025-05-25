"""
캡스톤 프로젝트 메인 애플리케이션 파일 📝
Flask 웹 서버와 뉴스 기사 분석 기능을 제공합니다.
(크롤러 기능, AI 분석 API 시뮬레이션 기능 추가)
"""
import json
import re
import html
import time
import traceback
import random # 🎲 무작위 점수 생성을 위해 추가
from typing import List, Dict, Tuple, Optional, Any
from flask import Flask, render_template, request, redirect, url_for, Response, jsonify

# 🛠️ 자체 제작 모듈 임포트
from modules import highlighter # 현재는 많이 사용되지 않지만, 텍스트 하이라이트 기능
from modules import crawler # 📰 뉴스 웹 크롤링 담당
from modules import analyzer_api_simulator # 🤖 AI 분석 API 호출 시뮬레이터

# --- 🌐 상수 정의 ---
DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
NAVER_NEWS_DOMAIN = "news.naver.com" # 네이버 뉴스 도메인

app = Flask(__name__)

# --- ✨ Helper Functions (보조 함수) ---
def clean_extracted_text(text: Optional[str], remove_trailing_number: bool = False) -> Optional[str]:
    """
    텍스트에서 불필요한 마크다운 유사 서식이나 앞뒤 공백, 특정 패턴을 제거합니다.
    Args:
        text (Optional[str]): 정리할 텍스트.
        remove_trailing_number (bool): 텍스트 끝의 '숫자.' 패턴 제거 여부.
    Returns:
        Optional[str]: 정리된 텍스트.
    """
    if not text: return None
    cleaned = text.strip()
    # 마크다운 볼드/이탤릭 등 제거
    cleaned = re.sub(r'\*\*(.*?)\*\*', r'\1', cleaned) # **bold** -> bold
    cleaned = re.sub(r'__(.*?)__', r'\1', cleaned) # __underline__ -> underline
    cleaned = re.sub(r'\*(.*?)\*', r'\1', cleaned)   # *italic* -> italic
    cleaned = re.sub(r'_(.*?)_', r'\1', cleaned)   # _italic_ -> italic
    # 목록 표시자 제거
    cleaned = re.sub(r'^\s*[-*+]\s*', '', cleaned) # 문장 시작의 -, *, + 제거
    # 앞뒤 따옴표 제거
    if len(cleaned) >= 2 and ((cleaned.startswith('"') and cleaned.endswith('"')) or \
                               (cleaned.startswith("'") and cleaned.endswith("'"))):
        cleaned = cleaned[1:-1]
    # 여러 공백을 단일 공백으로
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    # 끝에 오는 '숫자.' 패턴 제거 (예: "문장입니다. 1.")
    if remove_trailing_number:
        cleaned = re.sub(r'\s*\d+\.\s*$', '', cleaned).strip()
    return cleaned if cleaned else None

def parse_llama_analysis(raw_text: str) -> Tuple[List[Dict[str, Any]], str, Optional[str], Optional[str]]:
    """
    ⚠️ 레거시 Llama 분석 파싱 함수입니다. (현재 시뮬레이션/동작 없음)
    원래는 Llama 모델의 분석 결과를 구조화했지만, 현재는 사용되지 않습니다.
    Args:
        raw_text (str): Llama 모델의 원본 응답 텍스트.
    Returns:
        Tuple: 빈 리스트, HTML 형식의 원본 텍스트, "분석 정보 없음", "정보 없음".
    """
    structured_analysis: List[Dict[str, Any]] = []
    formatted_html = f'<p class="analysis-raw">{html.escape(raw_text)}</p>' # 원본 텍스트를 HTML로 표시
    print(f"[Parsing] ⚠️ Legacy Llama parsing (simulated/no-op).")
    return [], formatted_html, "분석 정보 없음", "정보 없음"


# --- 📍 라우트 정의 ---
@app.route('/')
def index():
    """ 🏠 메인 페이지를 렌더링합니다. """
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process_url():
    """
    사용자로부터 뉴스 URL 또는 텍스트를 받아 처리 페이지로 넘깁니다.
    네이버 뉴스 URL인 경우 크롤링을 시도하고, 그 외에는 입력된 텍스트를 그대로 사용합니다.
    """
    if request.method == 'POST':
        news_input = request.form.get('news_text', '').strip() # 📝 사용자가 입력한 값

        if not news_input:
            print(f"[Routing] ➡️ 아무것도 입력되지 않았습니다. 메인으로 돌아갑니다.")
            return redirect(url_for('index'))

        news_text_to_process = "" # 최종적으로 분석될 텍스트
        article_title_to_process = "입력된 내용" # 최종적으로 사용될 기사 제목

        # URL인지 텍스트인지 판별
        is_url = news_input.startswith('http://') or news_input.startswith('https://')

        if is_url:
            if NAVER_NEWS_DOMAIN in news_input: # 네이버 뉴스 URL인 경우
                print(f"[Routing] 🔗 네이버 뉴스 URL 감지. 크롤링 시도: {news_input}")
                crawled_data = crawler.extract_news_data(news_input) # 📰 크롤러 호출

                if "error" in crawled_data or not crawled_data.get("본문"):
                    error_msg = crawled_data.get("error", "기사 본문을 가져올 수 없었습니다.")
                    print(f"[Routing] 🐛 크롤링 오류 또는 내용 없음: {error_msg}")
                    news_text_to_process = f"URL 크롤링 실패: {html.escape(error_msg)}\n입력된 URL: {html.escape(news_input)}"
                    article_title_to_process = crawled_data.get("제목") or "크롤링 오류"
                else:
                    news_text_to_process = crawled_data.get("본문", "")
                    article_title_to_process = crawled_data.get("제목", "제목 없음")
                    if not news_text_to_process.strip(): # 본문이 비어있는 경우
                         news_text_to_process = "기사 본문을 가져왔으나 내용이 비어있습니다."
            else: # 네이버 뉴스가 아닌 URL
                print(f"[Routing] 🔗 지원하지 않는 URL 감지: {news_input}")
                news_text_to_process = f"지원되지 않는 URL입니다: {html.escape(news_input)}\n네이버 뉴스 URL을 입력하거나 내용을 직접 입력해주세요."
                article_title_to_process = "지원되지 않는 URL"
        else: # 일반 텍스트 입력
            print(f"[Routing] ✍️ 텍스트 입력 감지.")
            news_text_to_process = news_input

        # 내용 길이 검증 (오류 메시지가 아닌 경우에만)
        is_error_message_generated = "크롤링 실패" in news_text_to_process or \
                                     "지원되지 않는 URL" in news_text_to_process or \
                                     "내용이 비어있습니다" in news_text_to_process

        if len(news_text_to_process.strip()) < 10 and not is_error_message_generated:
            print(f"[Routing] 📏 입력된 텍스트가 너무 짧습니다 (길이: {len(news_text_to_process.strip())}).")
            original_title_if_any = article_title_to_process if article_title_to_process != "입력된 내용" else "내용 분석"
            news_text_to_process = "입력된 내용이 너무 짧습니다. 최소 10자 이상 입력해주세요."
            article_title_to_process = original_title_if_any


        print(f"[Routing] ⚙️ 처리 페이지 렌더링. 제목: '{article_title_to_process[:50]}...', 텍스트 길이: {len(news_text_to_process)}")
        return render_template('processing.html',
                               news_text_data=news_text_to_process,
                               article_title_data=article_title_to_process)
    else: # POST 요청이 아니면 메인으로
        return redirect(url_for('index'))

@app.route('/get_analysis_stream')
def get_analysis_stream():
    """
    클라이언트에게 Server-Sent Events (SSE)를 통해 분석 과정을 실시간으로 스트리밍합니다.
    AI 분석 API 시뮬레이터를 호출하고 그 결과를 단계별 또는 최종적으로 전송합니다.
    """
    news_text_from_client = request.args.get('news_text_data') # 클라이언트가 보낸 뉴스 본문
    article_title_from_client = request.args.get('article_title_data', '입력된 내용') # 클라이언트가 보낸 기사 제목

    if not news_text_from_client:
        # 분석할 텍스트가 없으면 오류 이벤트 전송
        def error_stream():
            yield f"event: error\ndata: {json.dumps({'message': '분석할 텍스트가 누락되었습니다.'})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream', status=400)

    print(f"[SSE] 🚀 'analysis' 스트림 시작. 제목: '{article_title_from_client[:50]}...', 텍스트 길이: {len(news_text_from_client)}.")

    def generate_analysis_data(current_title: str, current_content: str):
        """분석 데이터를 생성하고 SSE 이벤트로 yield하는 제너레이터 함수입니다."""
        actual_ai_result = None # 🤖 실제 AI 분석 결과 (또는 시뮬레이션된 결과)
        sse_error_message = None # SSE 스트림 내에서 사용할 오류 메시지
        score = 0 # 📊 신뢰도 점수 (랜덤 생성)

        # 입력 자체에 오류가 있는지 확인
        is_input_error = "크롤링 실패:" in current_content or \
                         "지원되지 않는 URL입니다:" in current_content or \
                         "입력된 내용이 너무 짧습니다." == current_content.strip() or \
                         "기사 본문을 가져왔으나 내용이 비어있습니다." == current_content.strip()

        try:
            yield f"event: status\ndata: {json.dumps({'step': '입력된 내용을 준비 중입니다...'})}\n\n" # ⏳ 상태 업데이트
            time.sleep(0.2)

            if is_input_error: # 입력 오류가 있다면 AI 분석 건너뛰기
                yield f"event: status\ndata: {json.dumps({'step': '입력 처리 중 오류가 감지되었습니다. AI 분석을 건너뜁니다.'})}\n\n"
                sse_error_message = current_content # 오류 메시지를 그대로 사용
                actual_ai_result = { # 오류 시에도 AI 결과 구조는 유지
                    "진위": "판단 불가 (입력 오류)",
                    "근거": current_content,
                    "분석": "입력된 뉴스 내용에 문제가 있어 AI 분석을 수행할 수 없습니다."
                }
            else: # 정상 입력이면 AI 분석 시뮬레이션
                yield f"event: status\ndata: {json.dumps({'step': 'AI 분석 API 호출 중... 🤖'})}\n\n"
                time.sleep(0.1)

                # 🤖 AI 분석 API 시뮬레이터 호출
                actual_ai_result = analyzer_api_simulator.call_fake_analysis_api(current_content, current_title)
                print(f"[SSE] ✅ AI 분석 API 결과 수신: {str(actual_ai_result)[:100]}...")


                yield f"event: status\ndata: {json.dumps({'step': 'AI 분석 완료. 결과 정리 중... ✨'})}\n\n"
                time.sleep(0.1)

                if actual_ai_result: # AI 결과에 따라 점수 랜덤 생성
                    veracity = actual_ai_result.get("진위", "").lower()
                    if "진짜 뉴스" in veracity: score = random.randint(70, 95)
                    elif "가짜일 가능성이 높은 뉴스" in veracity: score = random.randint(20, 40)
                    elif "가짜일 가능성이 있는 뉴스" in veracity: score = random.randint(40, 60)
                    elif "가짜 뉴스" in veracity: score = random.randint(0, 20)
                    else: score = random.randint(30, 50) # 판단 불가, 오류 등
                
                sse_error_message = "AI 분석이 완료되었습니다."
                if "오류" in actual_ai_result.get("진위", ""): # AI 결과 자체에 오류 메시지가 있다면
                    sse_error_message = actual_ai_result.get("근거", "AI 분석 중 문제가 발생했습니다.")


            # 💡 현재는 highlighter 모듈을 직접 사용하지 않고, 원본 내용을 그대로 전달합니다.
            # 하이라이팅 로직은 클라이언트(JavaScript) 또는 필요시 여기서 추가 가능합니다.
            article_content_highlighted = html.escape(current_content).replace('\n', '<br>')

            final_data = { # 📦 클라이언트에 최종적으로 전달할 데이터
                'score': score,
                'article_title': html.escape(current_title),
                'article_content_original': current_content, # 원본 텍스트 (이스케이프 안됨)
                'article_content_highlighted': article_content_highlighted, # HTML로 표시될 본문
                'simulated_ai_result': actual_ai_result, # AI 시뮬레이션 결과
                'error_message': sse_error_message # 오류 메시지 (있을 경우)
            }

            print(f"[SSE] 📊 최종 데이터 준비: 제목='{current_title[:30]}...', 점수={score}, AI 진위='{actual_ai_result.get('진위', 'N/A') if actual_ai_result else 'N/A'}'")
            yield f"event: final_data\ndata: {json.dumps(final_data)}\n\n" # 🎁 최종 데이터 전송
            print("[SSE] ✅ 최종 데이터 클라이언트에게 전송 완료.")

        except Exception as main_e: # 🐛 예상치 못한 오류 처리
            print(f"[SSE] 💥 generate_analysis_data 내에서 처리되지 않은 예외: {main_e}")
            print(traceback.format_exc()) # 상세 오류 로그 출력
            error_payload = {
                'message': f'데이터 처리 중 예기치 않은 서버 오류 발생: {str(main_e)}',
                'simulated_ai_result': { # AI 결과 부분도 오류로 채움
                    "진위": "오류", "근거": "서버 내부 오류 발생", "분석": str(main_e)
                }
            }
            yield f"event: error\ndata: {json.dumps(error_payload)}\n\n" # 오류 이벤트 전송


    # 📨 SSE 응답 생성 및 반환
    return Response(generate_analysis_data(article_title_from_client, news_text_from_client), mimetype='text/event-stream')

# --- 🚀 서버 실행 ---
if __name__ == '__main__':
    # 0.0.0.0으로 호스트를 설정하면 외부에서도 접속 가능
    app.run(host='0.0.0.0', port=5000, debug=True) # 메인 앱은 5000번 포트 사용