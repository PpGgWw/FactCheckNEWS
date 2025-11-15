## 시연 영상

[기본분석 시연](https://drive.google.com/file/d/1KkgjLJ2K41v4h13l8gMmw3YIh-ujAncA/view?usp=drive_link)  
[비교분석 시연](https://drive.google.com/file/d/1DqpSS3t5vxR92Bflw4BOIgffRZNi3f18/view?usp=sharing)

---

FactCheckNEWS (크롬 확장 프로그램)

Gemini AI 기반 실시간 뉴스 팩트체크 확장 프로그램

네이버 뉴스, 다음 뉴스 등 주요 뉴스 사이트에서 Gemini API를 활용해 기사의 신뢰도 및 진위 여부를 실시간으로 분석합니다.  
기사의 주요 부분을 자동 하이라이트하고, 분석 결과를 패널 형태로 직관적으로 표시합니다.

---

## 업데이트 내역

### 2025.11.15

**스트리밍 분석 UX 및 안정성 대폭 개선**

- **스트리밍 텍스트 최적화**
  - 중복 JSON 청크 제거를 위한 diff 캐시 도입으로 깨끗한 증분 텍스트 출력
  - 스니펫 애니메이션 컨테이너를 뉴스 블록 내부로 제한해 오버플로우 방지
  - 로딩 오버레이 색상 조정 (다크 그라데이션 + 브라운 강조색 테두리)으로 분석 중 상태를 명확하게 표시

- **크롤링 신뢰성 강화**
  - CORS 차단 시 iframe 폴백 메커니즘 추가로 크롤링 성공률 대폭 향상
  - 스마트 재시도 로직: 본문이 비어있거나 너무 짧으면 자동으로 다음 검색 결과 시도
  - 최대 5개 검색 결과까지 순회하며 유효한 기사 내용 확보

- **검색 결과 품질 개선**
  - Google Custom Search Engine ID를 `70364eb765310426e`로 업데이트
  - 뉴스 도메인 필터링 강화: 주요 언론사(naver.com, chosun.com, joongang.co.kr 등)만 검색 대상으로 제한
  - 일반 블로그/커뮤니티 결과 자동 제외로 신뢰도 높은 교차 검증 가능

- **현재 뉴스 동기화 강화**
  - `currentNews` 상태를 `newsBlocks`와 URL 기반으로 실시간 동기화
  - 분석 완료 시 현재 페이지와 기록이 자동으로 일치하도록 `completeAnalysis` 로직 개선
  - 페이지 새로고침 없이 즉시 최신 분석 결과 반영

- **실시간 분석 패널 인터랙션 개선**
  - 분석 중 카드가 기본 콘텐츠를 완전히 접고 상태 오버레이 높이만큼만 확장 (과도한 빈 공간 제거)
  - 진행 상태 텍스트·스트리밍 스니펫 높이를 실시간 측정해 부드러운 확장/축소 애니메이션 유지
  - 완료된 카드의 hover 글로우/스케일 효과 복원으로 결과 피드백을 더욱 명확하게 제공
  - 분석 오버레이에 단계별 진행 메시지 표시 (🔍 API 연결, 📝 파싱, 🤖 AI 요청, ⚡ 검증 등)

**효과:** 스트리밍 출력이 깔끔하고, 크롤링이 안정적이며, 검색 품질이 향상되어 전반적인 사용자 경험 대폭 개선

### 2025.11.13

**API 키 암호화 저장 기능**

- AES-GCM 256bit + PBKDF2 조합으로 API 키를 Chrome Storage/localStorage에 암호화 저장
- UserAgent·언어·플랫폼 정보를 이용한 기기별 고유 키와 매 요청마다 바뀌는 IV로 재사용 공격 차단
- `utils/crypto-utils.js`, `service_worker.js`, `components/AnalysisPanel.js`에 암호화/복호화 흐름을 통합하여 사용자는 기존 UX 그대로 이용 가능

---

## 주요 기능

### 자동 뉴스 추출 및 하이라이트
- **네이버 뉴스**: 제목, 본문, 시간 정보 자동 추출
- **다음 뉴스**: 제목, 본문, 저자/언론사, 작성일, 요약, 사진 설명 자동 추출
- 주요 텍스트 영역 시각적 하이라이트
- **모듈식 파서 구조**: 사이트별 독립적인 파싱 로직으로 쉬운 확장 가능
  - `NaverNewsParser`와 `DaumNewsParser`가 공통 인터페이스(`canParse`, `extractNewsData`, `updateHighlightColors`, `highlightSuspiciousSentences`)를 구현
  - `content_script.js`에서 현재 URL을 기반으로 자동 파서 선택
  - 새로운 뉴스 사이트 추가 시 파서 클래스만 작성하면 기존 코드 수정 없이 즉시 지원 가능

### AI 기반 팩트체크
- Gemini API를 통한 기사 진위 여부 실시간 분석
- 논리적 구조, 근거 제시 방식, 표현의 적절성 평가
- 진위 판정 및 상세 근거 제시

### 직관적인 UI/UX
- **우측 슬라이드 패널**: 우→좌 애니메이션으로 부드러운 표시
- **축소 모드**: 오른쪽 하단 미니 카드로 간소화, 현재 뉴스 및 최근 분석 3건 미리보기
- **플로팅 버튼**: 패널 닫기 후 빠른 재진입
- **테마 일관성**: 다크 모드 기반 전문적인 디자인
- **상세 뷰 최적화**: 패널 확장 시 패널 내부에서 자세히 보기, 축소 시 팝업 모달 유지

### 분석 기록 관리
- 분석된 뉴스 자동 저장 및 목록 관리
- 상태별 뱃지 표시 (대기 중, 분석 중, 완료, 오류)
- 기록 클릭으로 자세히 보기 모달 제공

### 설정 **옵션**
- 자동 패널 열기 설정
- 뉴스 브랜드 필터링 (연합뉴스, 조선일보, 중앙일보 등 10개 주요 언론사)
- 패널 투명도 조절

---

## 설치 및 사용법

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

## 주요 동작 흐름

1. **뉴스 페이지 진입** → 자동으로 기사 정보 추출 및 하이라이트
2. **패널 표시** → 우측에서 슬라이드 인, 현재 페이지 뉴스 표시
3. **분석 요청** → "분석하기" 버튼 클릭
4. **실시간 진행 상태** → AI 분석 단계별 진행 표시
5. **결과 표시** → 진위 판정, 근거, 분석 요약, 상세 분석 제공
6. **축소 모드** → 좌측 화살표 버튼으로 간소화 모드 전환
7. **기록 관리** → 분석된 뉴스 자동 저장, 목록에서 재확인 가능

---

## 프로젝트 구조

```
FactCheckNEWS/
├── manifest.json              # 확장 프로그램 메타데이터 (Manifest V3)
├── content_script.js          # 뉴스 페이지 스크립트 (파서 자동 선택 로직)
├── service_worker.js          # 백그라운드 서비스 워커 (Gemini API 호출, API 키 복호화)
├── utils/
│   └── crypto-utils.js        # API 키 암호화/복호화 유틸리티
├── parsers/
│   ├── naver-parser.js        # 네이버 뉴스 파서 (NaverNewsParser)
│   └── daum-parser.js         # 다음 뉴스 파서 (DaumNewsParser)
├── components/
│   ├── AnalysisPanel.js       # 메인 패널 컴포넌트 (API 키 암호화 저장)
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

## 기술 스택

- **Frontend**: Vanilla JavaScript, ES6+ (Class, async/await, Map)
- **UI Framework**: CSS-in-JS, Tailwind CSS v3
- **API**: Google Gemini API (gemini-2.0-flash)
- **Architecture**: Chrome Extension Manifest V3, Service Worker
- **Storage**: Chrome Storage API (chrome.storage.local)
- **Build Tool**: npm, Tailwind CLI

---

## 파서 확장성

### 새로운 뉴스 사이트 추가 방법

본 프로젝트는 **Strategy Pattern** 기반 모듈식 파서 구조로, 새로운 뉴스 사이트 지원이 매우 간단합니다.

#### 1단계: 파서 클래스 작성
`parsers/` 폴더에 새 파서 파일 생성 (예: `chosun-parser.js`):

```javascript
class ChosunNewsParser {
  canParse(url) {
    return url.includes('chosun.com/');
  }

  extractNewsData(colorScheme) {
    const title = document.querySelector('.article-title')?.textContent || '';
    const content = document.querySelector('.article-body')?.textContent || '';
    // ... 나머지 구현
    return { title, content, author, date };
  }

  updateHighlightColors(colorScheme) {
    // 하이라이트 색상 업데이트 로직
  }

  highlightSuspiciousSentences(sentences, colorScheme) {
    // 의심 문장 하이라이트 로직
  }
}

window.ChosunNewsParser = ChosunNewsParser;
```

#### 2단계: manifest.json 업데이트
```json
{
  "content_scripts": [{
    "matches": [
      "https://n.news.naver.com/*",
      "https://news.daum.net/*",
      "https://www.chosun.com/*"  // 추가
    ],
    "js": [
      "parsers/naver-parser.js",
      "parsers/daum-parser.js",
      "parsers/chosun-parser.js",  // 추가
      "components/AnalysisPanel.js",
      "content_script.js"
    ]
  }]
}
```

#### 3단계: content_script.js에서 자동 인식
`getParserForCurrentUrl()` 함수가 자동으로 새 파서를 감지합니다:

```javascript
function getParserForCurrentUrl() {
  const currentUrl = window.location.href;
  
  // 기존 파서들
  if (typeof window.NaverNewsParser !== 'undefined') {
    const parser = new window.NaverNewsParser();
    if (parser.canParse(currentUrl)) return parser;
  }
  
  // 새 파서 자동 추가됨
  if (typeof window.ChosunNewsParser !== 'undefined') {
    const parser = new window.ChosunNewsParser();
    if (parser.canParse(currentUrl)) return parser;
  }
  
  return null;
}
```

**핵심 장점:**
- 기존 코드 수정 없이 파서만 추가하면 즉시 지원
- 각 파서가 독립적으로 관리되어 유지보수 용이
- URL 기반 자동 선택으로 사용자 경험 일관성 유지

---

## 보안 고려사항

### API 키 암호화 저장
- **암호화 방식**: AES-GCM 256bit 암호화
- **키 유도**: PBKDF2 (10만회 반복)
- **기기별 고유화**: 사용자 기기 정보 기반 암호화 키 생성
- **랜덤 IV**: 매번 다른 초기화 벡터 사용
- **저장 위치**: Chrome Storage 또는 localStorage (암호화된 상태)

### API 키 관리
- **현재 버전**: 암호화하여 로컬 저장
- **배포 버전 권장사항**: 
  - 백엔드 프록시 서버를 통해 API 키 숨김
  - 클라이언트에 키를 직접 노출하지 않음
  - 사용자 인증 및 Rate Limiting 적용

### 개인정보 보호
- 사용자 계정 정보 수집하지 않음
- 기사 URL과 분석 결과만 로컬 저장
- Gemini API에는 기사 내용만 전송 (Google 보안 정책 준수)

---

## 개발 참고사항

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
- Floating Button: 인디고-퍼플 그라데이션 (`#4F46E5` → `#8B5CF6`)
