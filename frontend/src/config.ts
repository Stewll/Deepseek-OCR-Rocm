/**
 * Frontend configuration
 * Uses Vite environment variables for build-time configuration
 */

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Build-time constants (defined by Vite)
export const __DEV__ = import.meta.env.DEV;
export const __PROD__ = import.meta.env.PROD;

// Application Configuration
export const APP_NAME = 'DeepSeek OCR UI';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

// Feature flags
export const ENABLE_WEBCAM = import.meta.env.VITE_ENABLE_WEBCAM !== 'false'; // Default true
export const ENABLE_FILE_UPLOAD = import.meta.env.VITE_ENABLE_FILE_UPLOAD !== 'false'; // Default true

// Validation
if (!API_BASE_URL) {
  throw new Error('API_BASE_URL is required. Set VITE_API_BASE_URL environment variable.');
}

// Development logging
if (__DEV__) {
  console.log(`🚀 ${APP_NAME} v${APP_VERSION} - Development mode`);
  console.log(`📡 API Base URL: ${API_BASE_URL}`);
  console.log(`📷 Webcam enabled: ${ENABLE_WEBCAM}`);
  console.log(`📁 File upload enabled: ${ENABLE_FILE_UPLOAD}`);
}