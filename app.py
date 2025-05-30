"""
캡스톤 프로젝트 메인 애플리케이션 파일
Flask 웹 서버와 뉴스 기사 분석 기능을 제공합니다.
(크롤러 기능, AI 분석 API 호출 후 result.html에 결과 표시)
"""
import json
import re
import html
import traceback
from flask import Flask, render_template, request, redirect, url_for, jsonify

# 🛠️ 자체 제작 모듈 임포트
from modules import crawler # 뉴스 웹 크롤링 담당
from modules import analyzer_api_simulator # AI 분석 API 호출 담당

# --- 상수 정의 ---
DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
NAVER_NEWS_DOMAIN = "news.naver.com" # 네이버 뉴스 도메인

app = Flask(__name__)

# --- 라우트 정의 ---
@app.route('/')
def index():
    """ 메인 페이지를 렌더링합니다. """
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process_input():
    """
    사용자로부터 뉴스 URL 또는 텍스트를 받아 AI 분석 API를 호출하고,
    그 결과를 result.html 페이지에 표시합니다.
    """
    if request.method == 'POST':
        news_input = request.form.get('news_text', '').strip() # 사용자가 입력한 값

        if not news_input:
            print(f"[AppPy] 아무것도 입력되지 않았습니다. 메인으로 돌아갑니다.")
            # 오류 메시지와 함께 index.html로 리다이렉트하거나 오류 페이지를 보여줄 수 있습니다.
            # 여기서는 간단히 메시지를 포함한 result.html을 렌더링하도록 처리합니다.
            return render_template(
                'result.html',
                title="입력 오류",
                content="입력값이 없습니다. 다시 시도해주세요.",
                analysis_result={"진위": "-", "근거": "-", "분석": "입력값이 없어 분석을 수행할 수 없습니다."}
            )

        news_text_to_process = "" # 최종적으로 분석될 텍스트
        article_title_to_process = "입력된 내용" # 최종적으로 사용될 기사 제목

        # URL인지 텍스트인지 판별
        is_url = news_input.startswith('http://') or news_input.startswith('https://')

        if is_url:
            if NAVER_NEWS_DOMAIN in news_input: # 네이버 뉴스 URL인 경우
                print(f"[AppPy] 네이버 뉴스 URL 감지. 크롤링 시도: {news_input}")
                crawled_data = crawler.extract_news_data(news_input) # 크롤러 호출

                if "error" in crawled_data or not crawled_data.get("본문"):
                    error_msg = crawled_data.get("error", "기사 본문을 가져올 수 없었습니다.")
                    print(f"[AppPy] 크롤링 오류 또는 내용 없음: {error_msg}")
                    news_text_to_process = f"URL 크롤링 실패: {html.escape(error_msg)}\n입력된 URL: {html.escape(news_input)}"
                    article_title_to_process = crawled_data.get("제목") or "크롤링 오류"
                else:
                    news_text_to_process = crawled_data.get("본문", "")
                    article_title_to_process = crawled_data.get("제목", "제목 없음")
                    if not news_text_to_process.strip(): # 본문이 비어있는 경우
                         news_text_to_process = "기사 본문을 가져왔으나 내용이 비어있습니다."
            else: # 네이버 뉴스가 아닌 URL
                print(f"[AppPy] 지원하지 않는 URL 감지: {news_input}")
                news_text_to_process = f"지원되지 않는 URL입니다: {html.escape(news_input)}\n네이버 뉴스 URL을 입력하거나 내용을 직접 입력해주세요."
                article_title_to_process = "지원되지 않는 URL"
        else: # 일반 텍스트 입력
            print(f"[AppPy] 텍스트 입력 감지.")
            news_text_to_process = news_input
            # 텍스트 입력 시 제목은 첫 줄의 일부 또는 기본값으로 설정 가능
            # 여기서는 기본값 "입력된 내용"을 사용하거나, news_input의 일부를 제목으로 쓸 수 있습니다.
            # 예: article_title_to_process = news_input.split('\n')[0][:50] + "..." if news_input else "입력된 내용"


        # 내용 길이 검증 (오류 메시지가 아닌 경우에만)
        is_error_message_generated = "크롤링 실패" in article_title_to_process or \
                                     "지원되지 않는 URL" in article_title_to_process

        # AI 분석 API 호출 (analyzer_api_simulator 사용)
        try:
            print(f"[AppPy] AI 분석 API 호출 준비. 제목: '{article_title_to_process[:50]}...', 텍스트 길이: {len(news_text_to_process)}")
            api_response = analyzer_api_simulator.call_fake_analysis_api(
                news_content=news_text_to_process,
                news_title=article_title_to_process
            )

            print("\n" + "="*50)
            print("AI 분석 API 응답 (서버 콘솔):")
            print(json.dumps(api_response, ensure_ascii=False, indent=2))
            print("="*50 + "\n")

            # result.html 템플릿에 결과 전달
            return render_template(
                'result.html',
                title=article_title_to_process,
                content=news_text_to_process, # Jinja2가 기본적으로 HTML 이스케이프 처리
                analysis_result=api_response  # 딕셔너리 형태로 전달
            )

        except Exception as e:
            print(f"[AppPy] AI 분석 API 호출 중 오류 발생: {e}")
            print(traceback.format_exc())
            # API 호출 오류 시 사용자에게 보여줄 정보
            error_analysis_result = {
                "진위": "분석 오류",
                "근거": f"AI 분석 API 호출 중 서버 오류 발생: {html.escape(str(e))}",
                "분석": "서버 로그를 확인해주세요. AI 모델 서버가 실행 중인지, 네트워크 연결이 올바른지 확인이 필요합니다."
            }
            return render_template(
                'result.html',
                title=article_title_to_process if article_title_to_process else "분석 중 오류",
                content=news_text_to_process if news_text_to_process else "내용을 처리하는 중 오류가 발생했습니다.",
                analysis_result=error_analysis_result
            )

    else: # POST 요청이 아니면 메인으로
        return redirect(url_for('index'))

# --- 서버 실행 ---
if __name__ == '__main__':
    # 0.0.0.0으로 호스트를 설정하면 외부에서도 접속 가능
    app.run(host='0.0.0.0', port=5005, debug=True)
