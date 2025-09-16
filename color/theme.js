const colors = {
  // Main Palette with Semantic Names
  'primary': '#F2CEA2',        // 주요 배경/강조색
  'secondary': '#BF9780',      // 보조색/컨테이너
  'background': '#F2F2F2',     // 메인 배경색
  'text-secondary': '#737373', // 보조 텍스트
  'text-primary': '#0D0D0D',   // 주요 텍스트

  // Semantic/Status Colors (using theme colors when possible)
  'status-success': '#BF9780',      // Theme secondary
  'status-success-light': '#F2CEA2', // Theme primary
  'status-error': '#737373',        // Theme text-secondary
  'status-error-light': '#F2F2F2',  // Theme background
  'status-warning': '#F2CEA2',      // Theme primary
  'status-warning-light': '#F2F2F2',// Theme background
};

module.exports = colors;
