/**
 * API 키 암호화/복호화 유틸리티
 * Web Crypto API를 사용한 AES-GCM 암호화
 */

// 고정된 솔트 (실제 배포 시에는 더 안전한 방법 사용 권장)
const SALT = new Uint8Array([
  0x49, 0x73, 0x20, 0x74, 0x68, 0x69, 0x73, 0x20,
  0x73, 0x65, 0x63, 0x75, 0x72, 0x65, 0x3f, 0x21
]);

/**
 * 브라우저 고유 키를 생성 (기기별로 고유)
 * @returns {Promise<string>} 기기 고유 키
 */
async function getDeviceKey() {
  // 브라우저 지문 생성 (간단한 버전)
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
  if (!ctx) {
    throw new Error('캔버스 컨텍스트를 초기화할 수 없습니다.');
  }
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('fingerprint', 2, 2);
  const fingerprint = canvas.toDataURL();
  
  const userAgent = navigator.userAgent;
  const language = navigator.language;
  const platform = navigator.platform;
  
  const deviceString = `${fingerprint}-${userAgent}-${language}-${platform}`;
  
  // 해시 생성
  const encoder = new TextEncoder();
  const data = encoder.encode(deviceString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * 암호화 키 생성
 * @param {string} password - 비밀번호 (기기 고유 키)
 * @returns {Promise<CryptoKey>} 암호화 키
 */
async function deriveKey(password) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  
  // PBKDF2로 키 유도
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: SALT,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * API 키 암호화
 * @param {string} apiKey - 암호화할 API 키
 * @returns {Promise<string>} Base64로 인코딩된 암호화된 데이터 (IV + 암호문)
 */
export async function encryptApiKey(apiKey) {
  try {
    const deviceKey = await getDeviceKey();
    const key = await deriveKey(deviceKey);
    
    // IV (Initialization Vector) 생성
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 암호화
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(apiKey);
    
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encodedData
    );
    
    // IV + 암호문을 하나의 배열로 결합
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);
    
    // Base64로 인코딩
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('암호화 오류:', error);
    throw new Error('API 키 암호화에 실패했습니다.');
  }
}

/**
 * API 키 복호화
 * @param {string} encryptedData - Base64로 인코딩된 암호화된 데이터
 * @returns {Promise<string>} 복호화된 API 키
 */
export async function decryptApiKey(encryptedData) {
  try {
    const deviceKey = await getDeviceKey();
    const key = await deriveKey(deviceKey);
    
    // Base64 디코딩
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // IV와 암호문 분리
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    // 복호화
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    // 문자열로 변환
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  } catch (error) {
    console.error('복호화 오류:', error);
    throw new Error('API 키 복호화에 실패했습니다.');
  }
}
