## 📹 시연 영상

### [기본분석 시연](https://drive.google.com/file/d/1KkgjLJ2K41v4h13l8gMmw3YIh-ujAncA/view?usp=drive_link)
### [비교분석 시연](https://drive.google.com/file/d/1DqpSS3t5vxR92Bflw4BOIgffRZNi3f18/view?usp=sharing)

---

# FactCheckNEWS (크롬 확장 프로그램)

**Gemini AI 기반 실시간 뉴스 팩트체크 확장 프로그램**

네이버 뉴스를 비롯한 주요 뉴스 사이트에서 Gemini API를 활용해 기사의 신뢰도 및 진위 여부를 실시간으로 분석합니다.  
기사의 주요 부분을 자동 하이라이트하고, 분석 결과를 패널 형태로 직관적으로 표시합니다.

---

## ✨ 주요 기능

### 📰 자동 뉴스 추출 및 하이라이트
- 네이버 뉴스 기사 제목, 본문, 시간 정보 자동 추출
- 주요 텍스트 영역 시각적 하이라이트

### 🤖 AI 기반 팩트체크
- Gemini API를 통한 기사 진위 여부 실시간 분석
- 논리적 구조, 근거 제시 방식, 표현의 적절성 평가
- 진위 판정 및 상세 근거 제시

### 🎨 직관적인 UI/UX
- **우측 슬라이드 패널**: 우→좌 애니메이션으로 부드러운 표시
- **축소 모드**: 오른쪽 하단 미니 카드로 간소화, 현재 뉴스 및 최근 분석 3건 미리보기
- **플로팅 버튼**: 패널 닫기 후 빠른 재진입
- **테마 일관성**: 다크 모드 기반 전문적인 디자인

### 📊 분석 기록 관리
- 분석된 뉴스 자동 저장 및 목록 관리
- 상태별 뱃지 표시 (대기 중, 분석 중, 완료, 오류)
- 기록 클릭으로 자세히 보기 모달 제공

### ⚙️ 설정 **옵션**
- 자동 패널 열기 설정
- 뉴스 브랜드 필터링 (연합뉴스, 조선일보, 중앙일보 등 10개 주요 언론사)
- 패널 투명도 조절

---

## 🚀 설치 및 사용법

### 1. 크롬 확장 프로그램 설치

1. 크롬 브라우저 실행
2. 주소창에 `chrome://extensions` 입력 후 이동
3. 우측 상단 **개발자 모드** 활성화
4. **"압축해제된 확장 프로그램을 로드합니다"** 클릭
5. 다운로드한 `FactCheckNEWS` 폴더 선택하여 추가

### 2. 빌드 과정 (개발자용)

#### 빌드가 필요한 경우
아래 파일 또는 폴더의 코드를 수정하면 반드시 빌드 과정을 거쳐야 합니다:

- `panel/tailwind.css`, `tailwind.config.js` 등 **디자인/스타일 관련 파일**
- `panel/index.js`, `panel/Panel.jsx` 등 **패널 UI/React 컴포넌트**
- `components/AnalysisBlock.js`, `components/AnalysisPanel.js` 등 **분석 UI 컴포넌트**
- 기타 **CSS, JS, JSX, 스타일 관련 코드**

**참고:** `content_script.js`, `service_worker.js` 등 로직만 수정할 경우에는 빌드가 필요하지 않습니다.

#### 빌드 명령어

1. Node.js 설치 ([공식 사이트](https://nodejs.org/))
2. 터미널에서 프로젝트 폴더로 이동
   ```bash
   cd FactCheckNEWS
   ```
3. 패키지 설치
   ```bash
   npm install
   ```
4. Tailwind CSS 및 컴포넌트 빌드
   ```bash
   npm run build-once
   ```
5. 크롬 확장 프로그램 새로고침 (`chrome://extensions`에서 새로고침 버튼 클릭)

### 3. 확장 프로그램 사용

1. 확장 프로그램 활성화 후 [네이버 뉴스](https://news.naver.com/) 접속
2. 기사 제목, 본문, 시간 등이 자동 하이라이트됨
3. 우측에 분석 패널이 표시됨 (자동 열기 설정 시)
4. **분석하기** 버튼 클릭으로 Gemini AI 팩트체크 시작
5. 분석 완료 후 결과 확인 및 자세히 보기 가능

---

## 🎯 주요 동작 흐름

1. **뉴스 페이지 진입** → 자동으로 기사 정보 추출 및 하이라이트
2. **패널 표시** → 우측에서 슬라이드 인, 현재 페이지 뉴스 표시
3. **분석 요청** → "분석하기" 버튼 클릭
4. **실시간 진행 상태** → AI 분석 단계별 진행 표시
5. **결과 표시** → 진위 판정, 근거, 분석 요약, 상세 분석 제공
6. **축소 모드** → 좌측 화살표 버튼으로 간소화 모드 전환
7. **기록 관리** → 분석된 뉴스 자동 저장, 목록에서 재확인 가능

---

## 📂 프로젝트 구조

```
FactCheckNEWS/
├── manifest.json              # 확장 프로그램 메타데이터
├── content_script.js          # 뉴스 페이지 스크립트
├── service_worker.js          # 백그라운드 서비스 워커
├── components/
│   ├── AnalysisPanel.js       # 메인 패널 컴포넌트
│   ├── AnalysisBlock.js       # 분석 블록 컴포넌트
│   ├── VerdictBlock.js        # 진위 판정 블록
│   ├── EvidenceBlock.js       # 근거 블록
│   └── AnalysisDetailBlock.js # 상세 분석 블록
├── panel/
│   ├── Panel.jsx              # React 패널 컴포넌트
│   ├── index.js               # 패널 진입점
│   └── tailwind.css           # 컴파일된 스타일
├── color/
│   └── theme.js               # 테마 색상 정의
└── README.md
```

---

## 🛠️ 기술 스택

- **Frontend**: Vanilla JavaScript, ES6+
- **UI Framework**: CSS-in-JS, Tailwind CSS
- **API**: Google Gemini API
- **Architecture**: Chrome Extension Manifest V3
- **Build Tool**: npm, Tailwind CLI

---

## 📝 개발 참고사항

### 애니메이션 시스템
- 패널 전환: 150ms CSS transition
- 우→좌 슬라이드만 사용 (일관성 유지)
- 플로팅 버튼: cubic-bezier 탄성 애니메이션

### 상태 관리
- `localStorage`로 분석 기록 영구 저장
- 축소/확장 상태 세션 유지
- 설정값 실시간 반영

### 색상 팔레트
- Base: `#0D0D0D` (다크 배경)
- Accent: `#8C6E54` (브라운 강조)
- Floating Button: 인디고-퍼플 그라데이션 (`#4F46E5` → `#8B5CF6`)****