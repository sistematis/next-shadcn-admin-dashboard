/**
 * Per-client config via env. Branding-only = .env changes.
 */

export const CLIENT_CONFIG = {
  name: process.env.CLIENT_NAME || "ERP Sistematis",
  logo: "/logo.svg",
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:8082/api/v1",
};
