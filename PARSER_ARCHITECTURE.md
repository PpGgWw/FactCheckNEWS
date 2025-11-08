# 파서 모듈 구조

## 개요

FactCheckNEWS 프로젝트는 다양한 뉴스 사이트를 지원하기 위해 **모듈식 파서 구조**를 채택했습니다. 각 뉴스 사이트는 독립적인 파서 모듈을 가지며, content_script.js는 현재 URL에 따라 적절한 파서를 자동으로 선택합니다.

## 파서 모듈 아키텍처

```
parsers/
├── naver-parser.js    # 네이버 뉴스 전용 파서
└── daum-parser.js     # 다음 뉴스 전용 파서
```

### 공통 인터페이스

모든 파서는 다음과 같은 공통 메서드를 구현해야 합니다:

```javascript
class NewsParser {
  constructor() {
    this.siteName = 'site-name';           // 사이트 식별자
    this.siteDisplayName = '사이트 표시명';  // 로그용 표시명
  }

  /**
   * 현재 URL이 이 파서로 처리 가능한지 확인
   * @param {string} url - 현재 페이지 URL
   * @returns {boolean}
   */
  canParse(url) { }

  /**
   * 뉴스 데이터 추출 및 하이라이트 적용
   * @param {Object} colorScheme - { background, border }
   * @returns {Array} [{type, text}, ...]
   */
  extractNewsData(colorScheme) { }

  /**
   * 하이라이트 색상 업데이트
   * @param {Object} colorScheme - { background, border }
   * @returns {number} 업데이트된 요소 개수
   */
  updateHighlightColors(colorScheme) { }

  /**
   * 수상한 문장 하이라이트
   * @param {Array} suspiciousSentences - 문장 배열
   */
  highlightSuspiciousSentences(suspiciousSentences) { }
}
```

## 네이버 뉴스 파서 (naver-parser.js)

### 지원 URL 패턴
- `https://n.news.naver.com/article/*`
- `https://n.news.naver.com/mnews/*`

### 추출 데이터
- **제목**: `h2.media_end_head_headline`
- **본문**: `#dic_area`, `.go_trans._article_content`, `#articeBody`
- **시간**: `.media_end_head_info_datestamp_bunch .media_end_head_info_datestamp_time`

### 특징
- 심플한 구조, 표준 네이버 뉴스 레이아웃에 최적화
- 본문은 여러 셀렉터를 순차적으로 시도하여 호환성 보장

## 다음 뉴스 파서 (daum-parser.js)

### 지원 URL 패턴
- `https://v.daum.net/v/*`
- `https://news.v.daum.net/*`

### 추출 데이터
- **제목**: `h3.tit_view`, `h2.tit_head`
- **언론사/저자**: `a#kakaoServiceLogo`, `meta[property="og:article:author"]`
- **작성일**: `span.num_date`, `meta[property="og:regDate"]`
- **요약**: `strong.summary_view`, `meta[name="description"]`
- **본문**: `div.article_view`, `#articleBody` 내 `[dmcf-ptype]` 속성 요소
- **사진 설명**: `figcaption.txt_caption`

### 특징
- 다음 뉴스의 `dmcf-ptype` 속성 기반 구조화된 콘텐츠 처리
- Meta 태그 Fallback 지원으로 다양한 페이지 구조 대응
- 사진 설명(figure) 별도 처리

### Python → JavaScript 변환

팀원이 제공한 Python 크롤러(`daumNews.py`)를 분석하여 JavaScript로 완전히 재구현:

**Python 원본 로직:**
```python
# 제목
title_element = soup.select_one('h3.tit_view')
if not title_element:
    title_element = soup.select_one('h2.tit_head')

# 날짜 포맷팅
date_content = date_meta_element.get('content')  # "20251007070002"
year, month, day = date_content[0:4], date_content[4:6], date_content[6:8]
hour, minute = date_content[8:10], date_content[10:12]
date_text = f"{year}.{month}.{day}. {hour}:{minute}"

# dmcf-ptype 속성 기반 본문 파싱
content_blocks = body_container.find_all(attrs={'dmcf-ptype': True})
for block in content_blocks:
    ptype = block.get('dmcf-ptype')
    if ptype == 'figure':
        # 사진 처리
    elif ptype not in ['button']:
        # 본문 처리
```

**JavaScript 구현:**
```javascript
// 제목
let titleElement = document.querySelector('h3.tit_view');
if (!titleElement) {
  titleElement = document.querySelector('h2.tit_head');
}

// 날짜 포맷팅
const dateContent = dateMeta.getAttribute('content'); // "20251007070002"
const year = dateContent.substring(0, 4);
const month = dateContent.substring(4, 6);
const day = dateContent.substring(6, 8);
const hour = dateContent.substring(8, 10);
const minute = dateContent.substring(10, 12);
dateText = `${year}.${month}.${day}. ${hour}:${minute}`;

// dmcf-ptype 속성 기반 본문 파싱
const contentBlocks = bodyContainer.querySelectorAll('[dmcf-ptype]');
contentBlocks.forEach(block => {
  const ptype = block.getAttribute('dmcf-ptype');
  if (ptype === 'figure') {
    // 사진 처리
  } else if (ptype !== 'button') {
    // 본문 처리
  }
});
```

## content_script.js 통합

### 파서 선택 로직

```javascript
let currentParser = null;

function getParserForCurrentUrl() {
  const currentUrl = window.location.href;
  
  // 네이버 뉴스 파서
  if (typeof window.NaverNewsParser !== 'undefined') {
    const naverParser = new window.NaverNewsParser();
    if (naverParser.canParse(currentUrl)) {
      return naverParser;
    }
  }
  
  // 다음 뉴스 파서
  if (typeof window.DaumNewsParser !== 'undefined') {
    const daumParser = new window.DaumNewsParser();
    if (daumParser.canParse(currentUrl)) {
      return daumParser;
    }
  }
  
  return null;
}

async function initialize() {
  currentParser = getParserForCurrentUrl();
  if (!currentParser) {
    console.log('지원하지 않는 뉴스 사이트입니다.');
    return;
  }
  // ... 나머지 초기화 로직
}
```

### 파서 활용

```javascript
// 데이터 추출
function extractNewsData(savedAnalysis = null) {
  const colorScheme = getColorScheme(savedAnalysis?.verdict);
  extractedData = currentParser.extractNewsData(colorScheme);
  
  if (savedAnalysis?.suspicious) {
    currentParser.highlightSuspiciousSentences(savedAnalysis.suspicious);
  }
}

// 색상 업데이트
function updateHighlightColors(verdict) {
  const colorScheme = getColorScheme(verdict);
  currentParser.updateHighlightColors(colorScheme);
}
```

## 새로운 사이트 추가 방법

### 1. 파서 모듈 생성

`parsers/newsite-parser.js` 파일을 생성하고 공통 인터페이스를 구현:

```javascript
class NewSiteParser {
  constructor() {
    this.siteName = 'newsite';
    this.siteDisplayName = '새 사이트';
  }

  canParse(url) {
    return url.includes('newsite.com/news/');
  }

  extractNewsData(colorScheme) {
    const extractedData = [];
    // 제목, 본문 등 추출 로직
    return extractedData;
  }

  updateHighlightColors(colorScheme) {
    // 색상 업데이트 로직
    return elementsCount;
  }

  highlightSuspiciousSentences(suspiciousSentences) {
    // 수상한 문장 하이라이트 로직
  }

  _applyHighlight(element, colorScheme, styles = {}) {
    element.style.backgroundColor = colorScheme.background;
    element.style.border = `2px solid ${colorScheme.border}`;
    // ...
  }
}

window.NewSiteParser = NewSiteParser;
```

### 2. manifest.json 업데이트

```json
{
  "content_scripts": [
    {
      "matches": ["https://newsite.com/news/*"],
      "js": [
        "parsers/newsite-parser.js",
        "components/AnalysisPanel.js",
        "components/AnalysisBlock.js", 
        "components/VerdictBlock.js",
        "components/EvidenceBlock.js",
        "components/AnalysisDetailBlock.js",
        "content_script.js"
      ],
      "css": ["panel/tailwind.css"]
    }
  ]
}
```

### 3. content_script.js 수정

`getParserForCurrentUrl()` 함수에 새 파서 추가:

```javascript
function getParserForCurrentUrl() {
  const currentUrl = window.location.href;
  
  // 기존 파서들...
  
  // 새 사이트 파서
  if (typeof window.NewSiteParser !== 'undefined') {
    const newSiteParser = new window.NewSiteParser();
    if (newSiteParser.canParse(currentUrl)) {
      console.log('새 사이트 파서 선택');
      return newSiteParser;
    }
  }
  
  return null;
}
```

## 장점

### 1. **확장성**
- 새로운 사이트 추가 시 기존 코드 수정 최소화
- 각 파서는 독립적으로 개발/테스트 가능

### 2. **유지보수성**
- 사이트별 로직 분리로 버그 격리 및 수정 용이
- 하나의 사이트 변경이 다른 사이트에 영향 없음

### 3. **코드 재사용성**
- 공통 로직(색상 스킴, 저장소 처리)은 content_script에서 중앙 관리
- 파서는 DOM 조작에만 집중

### 4. **팀 협업**
- 각 팀원이 독립적으로 다른 사이트 파서 개발 가능
- 명확한 인터페이스로 통합 충돌 방지

## 테스트

### 네이버 뉴스
```
https://n.news.naver.com/article/001/0014956870
```

### 다음 뉴스
```
https://v.daum.net/v/qeNqgeVZ4I
```

각 사이트 접속 시:
1. 적절한 파서 자동 선택 확인 (콘솔 로그)
2. 제목, 본문 하이라이트 정상 작동
3. 데이터 추출 및 패널 표시
4. Gemini 분석 후 색상 업데이트 확인

## 디버깅

### 파서 선택 확인
```javascript
// 개발자 도구 콘솔에서
console.log(currentParser.siteName);        // 'naver' 또는 'daum'
console.log(currentParser.siteDisplayName); // '네이버 뉴스' 또는 '다음 뉴스'
```

### 추출 데이터 확인
```javascript
console.log(extractedData);
// [{type: '제목', text: '...'}, {type: '내용', text: '...'}, ...]
```

## 주의사항

1. **파서 로드 순서**: `manifest.json`에서 파서 스크립트를 `content_script.js`보다 먼저 로드
2. **전역 등록**: 각 파서는 `window` 객체에 등록하여 content_script에서 접근 가능하도록
3. **Null 체크**: `currentParser`가 null일 경우 처리 로직 필수
4. **CSS 셀렉터**: 사이트 구조 변경 시 파서 셀렉터 업데이트 필요
