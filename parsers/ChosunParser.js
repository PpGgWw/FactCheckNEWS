/**
 * 조선일보 전용 HTML 파서
 * Next.js SSR로 구성된 조선일보의 __NEXT_DATA__ JSON에서 기사 본문 추출
 */

class ChosunParser {
  /**
   * 조선일보 URL인지 확인
   */
  static isChosunUrl(url) {
    return url && url.includes('chosun.com');
  }

  /**
   * 조선일보 HTML에서 본문 추출
   * @param {string} html - 원본 HTML
   * @returns {string|null} - 추출된 본문 또는 null
   */
  static extractContent(html) {
    try {
      console.log('[ChosunParser] 🎯 조선일보 전용 파싱 시작');
      
      // 1단계: script 태그 추출
      const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
      if (!scriptMatches) {
        console.warn('[ChosunParser] ⚠️ script 태그 없음');
        return null;
      }
      
      console.log('[ChosunParser] 🔍 script 태그 개수:', scriptMatches.length);
      
      // 2단계: __NEXT_DATA__ 찾기
      for (let i = 0; i < scriptMatches.length; i++) {
        const scriptTag = scriptMatches[i];
        
        // id="__NEXT_DATA__" 체크
        if (!scriptTag.includes('id="__NEXT_DATA__"') && !scriptTag.includes("id='__NEXT_DATA__'")) {
          continue;
        }
        
        console.log('[ChosunParser] 🎯 __NEXT_DATA__ 발견!');
        
        // script 내용 추출
        const contentMatch = scriptTag.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (!contentMatch || !contentMatch[1]) {
          console.warn('[ChosunParser] ⚠️ script 내용 추출 실패');
          continue;
        }
        
        const jsonContent = contentMatch[1].trim();
        
        // JavaScript 코드 제외
        if (jsonContent.startsWith('import') || jsonContent.includes('import {')) {
          console.log('[ChosunParser] ⚠️ JavaScript 코드, 건너뛰기');
          continue;
        }
        
        // 3단계: JSON 파싱
        try {
          const jsonData = JSON.parse(jsonContent);
          console.log('[ChosunParser] ✅ JSON 파싱 성공');
          console.log('[ChosunParser] 📦 최상위 키:', Object.keys(jsonData).slice(0, 10).join(', '));
          
          // 4단계: 본문 탐색
          const content = this.searchForContent(jsonData);
          
          if (content && content.length > 500) {
            console.log('[ChosunParser] ✅ 본문 추출 성공:', content.length, '자');
            
            // 5단계: HTML 태그 제거 및 정제
            const cleaned = this.cleanHtml(content);
            console.log('[ChosunParser] ✅ 정제 완료:', cleaned.length, '자');
            
            return cleaned;
          } else {
            console.warn('[ChosunParser] ⚠️ 본문 부족:', content?.length || 0, '자');
          }
        } catch (jsonError) {
          console.warn('[ChosunParser] ⚠️ JSON 파싱 실패:', jsonError.message);
          continue;
        }
      }
      
      console.error('[ChosunParser] ❌ 본문 추출 실패');
      return null;
      
    } catch (error) {
      console.error('[ChosunParser] ❌ 파싱 오류:', error);
      return null;
    }
  }

  /**
   * JSON 객체에서 재귀적으로 본문 탐색
   * @param {object} obj - JSON 객체
   * @param {number} depth - 현재 깊이
   * @param {string} path - 현재 경로
   * @returns {string} - 발견된 본문
   */
  static searchForContent(obj, depth = 0, path = '') {
    // 깊이 제한
    if (depth > 15 || !obj || typeof obj !== 'object') {
      return '';
    }
    
    let found = '';
    const contentKeys = [
      'content', 'body', 'text', 'article', 
      'articleBody', 'newsContent', 'description',
      'html', 'contentHtml', 'contentText'
    ];
    
    for (const key of Object.keys(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      const value = obj[key];
      
      // 문자열 값 체크
      if (typeof value === 'string' && value.length > 300) {
        // HTML 태그 개수 확인
        const htmlTagCount = (value.match(/<[^>]+>/g) || []).length;
        const keyLower = key.toLowerCase();
        
        // 본문 가능성 높은 조건
        const isLikelyContent = 
          htmlTagCount > 10 || // HTML 태그 많음
          contentKeys.some(k => keyLower.includes(k)) || // 키 이름에 content 등 포함
          value.length > 1000; // 충분히 긴 텍스트
        
        if (isLikelyContent) {
          console.log(`[ChosunParser] 📄 본문 후보 발견: ${currentPath} (${value.length}자, HTML태그 ${htmlTagCount}개)`);
          found += value + ' ';
          
          // 충분히 찾았으면 중단
          if (found.length > 5000) {
            console.log('[ChosunParser] ✅ 충분한 본문 수집, 탐색 중단');
            break;
          }
        }
      } 
      // 재귀 탐색
      else if (typeof value === 'object' && value !== null) {
        // 배열은 처음 10개만
        if (Array.isArray(value)) {
          for (let i = 0; i < Math.min(value.length, 10); i++) {
            found += this.searchForContent(value[i], depth + 1, `${currentPath}[${i}]`);
          }
        } else {
          found += this.searchForContent(value, depth + 1, currentPath);
        }
      }
      
      // 충분히 찾았으면 중단
      if (found.length > 5000) {
        break;
      }
    }
    
    return found;
  }

  /**
   * HTML 태그 제거 및 텍스트 정제
   * @param {string} html - HTML 문자열
   * @returns {string} - 정제된 텍스트
   */
  static cleanHtml(html) {
    let cleaned = html;
    
    // script, style 태그 제거
    cleaned = cleaned.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
    cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
    
    // 모든 HTML 태그 제거
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');
    
    // HTML 엔티티 디코딩
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'");
    
    // 공백 정리
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }
}

// Export (브라우저 환경)
if (typeof window !== 'undefined') {
  window.ChosunParser = ChosunParser;
}
