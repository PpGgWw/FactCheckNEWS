# 가짜뉴스 판별 웹 애플리케이션

-------------

```
├── app.py                 # Flask 애플리케이션 메인 파일
|
├── modules/               # 기능별 파이썬 모듈을 저장합니다.
│   ├── __init__.py        # 이 폴더를 파이썬 패키지로 만듭니다. (내용은 비어 있습니다.)
│   ├── scraper.py         # (예시) 뉴스 스크래핑 관련 함수/클래스
│   ├── analyzer.py        # (예시) 신뢰도 분석 모델 관련 함수/클래스
│   └── llama_analyzer.py  # (예시) Llama 모델 연동 관련 함수/클래스
│   └── ...                # 다른 기능 모듈들
|
├── static/                # 정적 파일 폴더를 저장합니다. (CSS, JS, 이미지 등)
│   ├── style.css          # 스타일시트
│   └── script.js          # 자바스크립트 파일
│   └── (images/)          # (선택) 이미지 폴더
|
└── templates/             # HTML 템플릿을 저장합니다.
    ├── index.html         # 메인 페이지 템플릿
    └── result.html        # 결과 페이지 템플릿
```
실행을 위해 콘솔에서 명령어를 입력합니다.  
```
pip install Flask requests beautifulsoup4
```
