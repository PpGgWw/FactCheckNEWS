# 가짜뉴스 판별 웹 애플리케이션 (진행중)  
-------------  

  

https://github.com/user-attachments/assets/4709b85c-d1ed-435e-91ef-3dd08f853020


  
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

접속 방법:  
  
서버 PC의 로컬 IP 주소 확인:  
> Flask 서버를 실행하는 PC의 내부 네트워크 IP 주소를 알아야 합니다. 이 주소는 보통 192.168.x.x 또는 10.x.x.x 와 같은 형태입니다.  
> 1. Windows: 명령 프롬프트(cmd)에서 ipconfig 명령어를 실행하고, 사용 중인 네트워크 어댑터(예: 이더넷 어댑터 또는 Wi-Fi 어댑터)의 "IPv4 주소"를 확인합니다.  
> 2. macOS: 터미널에서 ifconfig 명령어를 실행하거나, 시스템 환경설정 > 네트워크에서 사용 중인 연결의 IP 주소를 확인합니다.  
> 3. Linux: 터미널에서 ip addr 또는 ifconfig 명령어를 실행합니다.
  
다른 기기에서 접속:  
> 1. 같은 네트워크에 연결된 다른 PC나 모바일 기기의 웹 브라우저를 엽니다.
> 2. 주소창에 http://<서버 PC의 로컬 IP 주소>:5000 을 입력합니다. (예: http://192.168.0.15:5000)
> 3. Flask 앱이 정상적으로 실행 중이라면 해당 기기에서도 웹 페이지가 보여야 합니다.
