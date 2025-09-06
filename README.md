# FactCheckNEWS (크롬 확장 프로그램)

네이버 뉴스 등 주요 뉴스 사이트에서 Gemini API를 활용해 기사 신뢰도 및 진위 여부·근거·분석 결과를 실시간으로 제공합니다.  
기사 주요 부분을 하이라이트하고, 결과를 패널 형태로 직관적으로 확인할 수 있습니다.

---

## 주요 기능

- 네이버 뉴스 기사 제목/본문/시간 자동 하이라이트 및 정보 추출
- Gemini API를 통한 뉴스 기사 진위 여부·근거·분석 결과 패널 표시
- 크롬 확장 프로그램 형태로 간편 적용 및 해제 가능

---

## 설치 및 사용법

### 1. 크롬 개발자 모드에서 확장 프로그램 추가하기

1. 크롬 브라우저 실행
2. 주소창에 `chrome://extensions` 입력 후 이동
3. 우측 상단 **개발자 모드** 활성화
4. "압축해제된 확장 프로그램을 로드합니다" 클릭
5. 다운로드한 FactCheckNEWS 폴더 선택하여 추가

### 2. 빌드 과정 (필수)

**최신 코드/디자인을 적용하려면 반드시 아래 빌드 과정을 거쳐야 합니다.**

1. Node.js 설치 ([공식 사이트](https://nodejs.org/))
2. 터미널에서 프로젝트 폴더로 이동
   ```bash
   cd FactCheckNEWS
   ```
3. 패키지 설치
   ```bash
   npm install
   ```
4. Tailwind CSS 등 빌드
   ```bash
   npm run build-once
   ```
5. 크롬 확장프로그램을 새로고침하여 최신 코드 적용

### 3. 확장 프로그램 활성화 후 네이버 뉴스에서 사용

- 확장프로그램 활성화 후 [네이버 뉴스](https://news.naver.com/) 접속
- 기사 제목, 본문, 시간 등이 자동 하이라이트
- 진위·근거·분석 결과가 패널로 표시됨

### 4. API KEY 발급 및 적용

- Gemini API 등 외부 서비스의 API KEY 필요
- 직접 발급받아 `service_worker.js`에 입력 후 확장프로그램 재로드

```javascript
// service_worker.js 내에 아래와 같이 입력
const API_KEY = "여기에_본인_API_KEY_입력";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
```

---

## 코드 구조 및 동작 원리

- `content_script.js` / `content_script_new.js`: 뉴스 데이터 추출, 하이라이트, Gemini API 분석 요청
- `service_worker.js`: Gemini API 호출, 분석 결과 전달
- `components/AnalysisBlock.js` 등: 분석 결과 패널 UI
- `manifest.json`: 확장 프로그램 정보 및 권한 설정

---

## FAQ

- 네이버 뉴스에 접속하면 기사 주요 부분이 자동 하이라이트
- 분석 결과는 패널에 "진위", "근거", "분석"으로 표시
- API KEY 미입력 시 분석 기능 미작동
- 코드/디자인 수정 시 반드시 빌드 후 확장프로그램 새로고침

---

## 빌드가 필요한 경우

아래 파일 또는 폴더의 코드를 수정하면 반드시 빌드 과정을 다시 거쳐야 합니다.

- `panel/tailwind.css`, `tailwind.config.js` 등 **디자인/스타일 관련 파일**
- `panel/index.js`, `panel/Panel.jsx` 등 **패널 UI/React 컴포넌트 코드**
- `components/AnalysisBlock.js` 등 **분석 결과 UI 컴포넌트**
- 기타 **CSS, JS, JSX, 스타일 관련 코드**

즉, **디자인(UI/UX)이나 화면에 표시되는 컴포넌트/스타일을 수정한 경우**
→ `npm run build-once`로 반드시 빌드 후, 크롬 확장프로그램을 새로고침해야 최신 내용이 적용됩니다.

**참고:**
`content_script.js`, `service_worker.js` 등 로직만 수정할 경우에는 빌드가 필요하지 않습니다.
(단, 이 파일에서 UI/스타일 관련 코드가 변경되면 빌드 필요)

---

## 개발 상태 안내

- 본 프로젝트는 **개발 중**이며, 테스트 목적 코드입니다.
- 디자인(UI/UX)은 임시 구성, 기능은 핵심 위주로만 구현됨
- 버그, 미완성 기능 있을 수 있으니 참고 바랍니다

---
