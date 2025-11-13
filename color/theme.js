const colors = {
  // Main Palette with Semantic Names
  'primary': '#F2CEA2',        // 주요 배경/강조색
  'primary-dark': '#E6B885',   // 주요색 진한 버전
  'primary-light': '#F8E3C4',  // 주요색 밝은 버전
  
  'secondary': '#BF9780',      // 보조색/컨테이너
  'secondary-dark': '#A67F66',  // 보조색 진한 버전
  'secondary-light': '#D4B29A', // 보조색 밝은 버전
  
  'background': '#FAFAFA',     // 메인 배경색 (더 밝게)
  'background-dark': '#F2F2F2', // 배경색 어두운 버전
  'background-panel': '#E8E8E8', // 패널 배경색 (더 어둡게)
  'background-card': '#FFFFFF', // 카드 배경색
  
  'text-primary': '#1A1A1A',   // 주요 텍스트 (더 진하게)
  'text-secondary': '#6B6B6B', // 보조 텍스트 (약간 밝게)
  'text-muted': '#9CA3AF',     // 비활성 텍스트
  
  // Surface Colors
  'surface': '#FFFFFF',        // 카드/패널 표면
  'surface-hover': '#F9F9F9',  // 호버 상태
  'surface-active': '#F0F0F0', // 활성 상태
  
  // Border Colors
  'border': '#E5E5E5',         // 기본 테두리
  'border-light': '#F0F0F0',   // 밝은 테두리
  'border-dark': '#D1D1D1',    // 진한 테두리

  // Semantic/Status Colors (개선된 색상)
  'status-success': '#10B981',      // 성공 (초록)
  'status-success-light': '#D1FAE5', // 성공 배경
  'status-success-dark': '#059669',  // 성공 진한색
  
  'status-error': '#EF4444',        // 오류 (빨강)
  'status-error-light': '#FEE2E2',  // 오류 배경
  'status-error-dark': '#DC2626',   // 오류 진한색
  
  'status-warning': '#F59E0B',      // 경고 (주황)
  'status-warning-light': '#FEF3C7', // 경고 배경
  'status-warning-dark': '#D97706',  // 경고 진한색
  
  'status-info': '#3B82F6',         // 정보 (파랑)
  'status-info-light': '#DBEAFE',   // 정보 배경
  'status-info-dark': '#2563EB',    // 정보 진한색
  
  // Interactive Colors
  'accent': '#8B5CF6',              // 액센트 색상
  'accent-light': '#EDE9FE',        // 액센트 배경
  'accent-dark': '#7C3AED',         // 액센트 진한색
  
  // Opacity utilities (for consistent rgba usage)
  'opacity-10': '0.1',
  'opacity-15': '0.15',
  'opacity-20': '0.2',
  'opacity-25': '0.25',
  'opacity-30': '0.3',
  'opacity-40': '0.4',
  'opacity-50': '0.5',
};

// Typography Scale (for consistent font sizing)
// Use these with Tailwind text-* classes
const typography = {
  // text-xs: 0.75rem (12px)
  // text-sm: 0.875rem (14px)
  // text-base: 1rem (16px)
  // text-lg: 1.125rem (18px)
  // text-xl: 1.25rem (20px)
  // text-2xl: 1.5rem (24px)
  // text-3xl: 1.875rem (30px)
};

// Spacing Scale (for consistent padding/margin)
// Use Tailwind spacing: p-1(4px), p-2(8px), p-3(12px), p-4(16px), p-5(20px), p-6(24px)
// p-8(32px), p-10(40px), p-12(48px), p-16(64px)

module.exports = colors;
