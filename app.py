# app.py
from flask import Flask, render_template, request, redirect, url_for

# Flask 앱 초기화
app = Flask(__name__)

# === 여기에 스크래핑 및 분석 함수 정의 ===
# def scrape_naver_news(url): ...
# def analyze_trustworthiness(text): ...
# def get_llama_analysis(text): ...
# ======================================

# 메인 페이지 라우트
@app.route('/')
def index():
    """메인 입력 페이지를 렌더링합니다."""
    return render_template('index.html')

# URL 처리 및 결과 페이지 라우트
@app.route('/process', methods=['POST'])
def process_url():
    """입력받은 URL을 처리하고 결과 페이지를 렌더링합니다."""
    if request.method == 'POST':
        news_url = request.form.get('news_url')

        if not news_url:
            return redirect(url_for('index'))

        # --- 실제 기능 구현 필요 ---
        article_content = f"Content scraped from {news_url}" # scrape_naver_news(news_url)
        score = 75 # analyze_trustworthiness(article_content)
        analysis = f"<p>AI analysis for content: {article_content[:50]}...</p>" # get_llama_analysis(article_content)
        # --------------------------

        return render_template('result.html',
                               score=score,
                               article_content=article_content,
                               analysis=analysis)
    else:
        return redirect(url_for('index'))

# 앱 실행 (같은 네트워크에서 접속 가능하도록 설정)
if __name__ == '__main__':
    # host='0.0.0.0' 추가: 모든 네트워크 인터페이스에서 접속 허용
    # debug=True는 개발 중에만 사용하세요.
    print(" * 로컬 네트워크에서 접속하려면 다음 주소를 사용하세요:")
    print(" * http://<본인 PC의 IP 주소>:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
