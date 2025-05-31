import json
import re
import html
import traceback
from flask import Flask, render_template, request, redirect, url_for, jsonify

# 사용자 정의 모듈 임포트
from modules import crawler # 뉴스 웹 크롤링 기능 담당 모듈
from modules import analyzer_api_simulator # AI 분석 API 시뮬레이터 모듈

# --- 상수 정의 ---
DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
NAVER_NEWS_DOMAIN = "news.naver.com" # 네이버 뉴스 도메인 문자열

app = Flask(__name__) # Flask 애플리케이션 인스턴스 생성

# --- 라우트 정의 ---
@app.route('/')
def index():
    # 메인 페이지 (index.html)를 렌더링하는 함수
    return render_template('index.html')

@app.route('/process', methods=['POST'])
def process_input():
    # 사용자로부터 뉴스 URL 또는 텍스트 입력을 받아 처리하고 결과를 반환하는 함수
    # POST 요청만 처리
    if request.method == 'POST':
        news_input = request.form.get('news_text', '').strip() # 폼 데이터에서 'news_text' 값을 가져옴

        # 입력값이 없는 경우 처리
        if not news_input:
            print(f"[AppPy] 아무것도 입력되지 않았습니다. 메인으로 돌아갑니다.")
            # 입력 오류 메시지와 함께 result.html 렌더링
            return render_template(
                'result.html',
                title="입력 오류",
                content="입력값이 없습니다. 다시 시도해주세요.",
                analysis_result={"진위": "-", "근거": "-", "분석": "입력값이 없어 분석을 수행할 수 없습니다."}
            )

        news_text_to_process = "" # AI 분석 API로 전달될 최종 텍스트
        article_title_to_process = "입력된 내용" # 결과 페이지에 표시될 기사 제목

        # 입력값이 URL인지 텍스트인지 판별
        is_url = news_input.startswith('http://') or news_input.startswith('https://')

        if is_url:
            # 입력값이 URL인 경우
            if NAVER_NEWS_DOMAIN in news_input:
                # 네이버 뉴스 URL인 경우 크롤링 시도
                print(f"[AppPy] 네이버 뉴스 URL 감지. 크롤링 시도: {news_input}")
                crawled_data = crawler.extract_news_data(news_input) # 크롤러 모듈을 사용하여 뉴스 데이터 추출

                # 크롤링 결과 확인
                if "error" in crawled_data or not crawled_data.get("본문"):
                    # 크롤링 오류 또는 본문 내용이 없는 경우
                    error_msg = crawled_data.get("error", "기사 본문을 가져올 수 없었습니다.")
                    print(f"[AppPy] 크롤링 오류 또는 내용 없음: {error_msg}")
                    news_text_to_process = f"URL 크롤링 실패: {html.escape(error_msg)}\n입력된 URL: {html.escape(news_input)}"
                    article_title_to_process = crawled_data.get("제목") or "크롤링 오류"
                else:
                    # 크롤링 성공 시
                    news_text_to_process = crawled_data.get("본문", "")
                    article_title_to_process = crawled_data.get("제목", "제목 없음")
                    if not news_text_to_process.strip():
                         news_text_to_process = "기사 본문을 가져왔으나 내용이 비어있습니다."
            else:
                # 네이버 뉴스가 아닌 다른 URL인 경우
                print(f"[AppPy] 지원하지 않는 URL 감지: {news_input}")
                news_text_to_process = f"지원되지 않는 URL입니다: {html.escape(news_input)}\n네이버 뉴스 URL을 입력하거나 내용을 직접 입력해주세요."
                article_title_to_process = "지원되지 않는 URL"
        else:
            # 입력값이 일반 텍스트인 경우
            print(f"[AppPy] 텍스트 입력 감지.")
            news_text_to_process = news_input
            # 텍스트 입력의 경우, 제목은 기본값을 사용하거나 입력 내용의 일부를 사용할 수 있음

        # AI 분석 API 호출
        try:
            print(f"[AppPy] AI 분석 API 호출 준비. 제목: '{article_title_to_process[:50]}...', 텍스트 길이: {len(news_text_to_process)}")
            # analyzer_api_simulator 모듈을 사용하여 가짜 분석 API 호출
            api_response = analyzer_api_simulator.call_fake_analysis_api(
                news_content=news_text_to_process,
                news_title=article_title_to_process
            )

            print("\n" + "="*50)
            print("AI 분석 API 응답 (서버 콘솔):")
            print(json.dumps(api_response, ensure_ascii=False, indent=2)) # API 응답을 콘솔에 출력
            print("="*50 + "\n")

            # 분석 결과를 result.html 템플릿에 전달하여 렌더링
            return render_template(
                'result.html',
                title=article_title_to_process,
                content=news_text_to_process,
                analysis_result=api_response
            )

        except Exception as e:
            # AI 분석 API 호출 중 예외 발생 시 처리
            print(f"[AppPy] AI 분석 API 호출 중 오류 발생: {e}")
            print(traceback.format_exc()) # 예외 정보 출력
            # 오류 정보를 포함한 analysis_result 생성
            error_analysis_result = {
                "진위": "분석 오류",
                "근거": f"AI 분석 API 호출 중 서버 오류 발생: {html.escape(str(e))}",
                "분석": "서버 로그를 확인해주세요. AI 모델 서버가 실행 중인지, 네트워크 연결이 올바른지 확인이 필요합니다."
            }
            # 오류 결과를 result.html 템플릿에 전달하여 렌더링
            return render_template(
                'result.html',
                title=article_title_to_process if article_title_to_process else "분석 중 오류",
                content=news_text_to_process if news_text_to_process else "내용을 처리하는 중 오류가 발생했습니다.",
                analysis_result=error_analysis_result
            )

    else:
        # POST 요청이 아닌 경우 메인 페이지로 리다이렉트
        return redirect(url_for('index'))

# --- 서버 실행 ---
if __name__ == '__main__':
    # 스크립트가 직접 실행될 때 Flask 개발 서버 실행
    # host='0.0.0.0'으로 설정하여 외부 접속 허용
    app.run(host='0.0.0.0', port=5005, debug=True)
