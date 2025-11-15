# 언론사별 전용 파서

이 폴더는 특정 언론사의 HTML 구조에 최적화된 파서를 포함합니다.

## 📁 파일 구조

```
parsers/
├── README.md
└── ChosunParser.js     # 조선일보 전용 파서
```

## 🎯 파서 추가 가이드

새로운 언론사 파서를 추가하려면:

1. **파서 클래스 생성** (`XxxParser.js`)
```javascript
class XxxParser {
  static isXxxUrl(url) {
    return url && url.includes('xxx.com');
  }
  
  static extractContent(html) {
    // HTML 파싱 로직
    return extractedContent;
  }
}

if (typeof window !== 'undefined') {
  window.XxxParser = XxxParser;
}
```

2. **Panel.html에 추가**
```html
<script src="../parsers/XxxParser.js"></script>
```

3. **AnalysisPanel.js에서 사용**
```javascript
if (window.XxxParser && window.XxxParser.isXxxUrl(url)) {
  const content = window.XxxParser.extractContent(html);
  if (content) return content;
}
```

## 📋 현재 지원 언론사

### ChosunParser.js
- **대상**: 조선일보 (chosun.com)
- **기술**: Next.js SSR, `__NEXT_DATA__` JSON 파싱
- **특징**: 재귀적 본문 탐색, HTML 정제

## 🔧 파서 개발 팁

1. **URL 감지**: `isXxxUrl()` 메서드로 해당 언론사 여부 확인
2. **JSON 우선**: SSR 사이트는 script 태그의 JSON 데이터 활용
3. **Fallback**: 실패 시 일반 파서로 넘어가도록 설계
4. **로깅**: 상세한 디버깅 로그로 문제 파악 용이하게
5. **테스트**: 여러 기사로 테스트하여 안정성 확인

## 📊 파서 우선순위

```
1. 언론사 전용 파서 (ChosunParser 등)
   ↓ 실패 시
2. AI 파싱 (parseHtmlWithAI)
   ↓ 실패 시
3. 정규식 fallback
```
