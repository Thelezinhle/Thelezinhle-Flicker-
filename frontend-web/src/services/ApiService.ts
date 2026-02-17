/**
 * API Service - Central HTTP client for FlickerSecure
 * 
 * Handles all communication with the backend API including:
 * - Authentication (login, register, token refresh)
 * - Delivery management (CRUD operations)
 * - Proximity tracking updates
 * - Venue management
 * - QR verification
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: 'customer' | 'courier' | 'admin';
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface ProximityUpdatePayload {
  deliveryId: string;
  latitude: number;
  longitude: number;
  distance?: number;
  phase?: string;
  technology?: string;
  accuracy?: number;
}

export interface ProximityUpdateResponse {
  distance: number;
  phase: string;
  technology_recommended: string;
  bearing?: number;
  eta?: number;
}

class ApiService {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(baseUrl: string = '') {
    // Auto-detect base URL
    this.baseUrl = baseUrl || this.detectBaseUrl();
    this.loadTokens();
    console.log(`🌐 ApiService initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Detect the API base URL based on environment
   */
  private detectBaseUrl(): string {
    // In development, use localhost
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:3000';
    }
    // In production, use same origin
    return window.location.origin;
  }

  /**
   * Load tokens from localStorage
   */
  private loadTokens(): void {
    this.accessToken = localStorage.getItem('auth_token');
    this.refreshToken = localStorage.getItem('refresh_token');
    const expiry = localStorage.getItem('token_expiry');
    this.tokenExpiry = expiry ? parseInt(expiry) : 0;
  }

  /**
   * Save tokens to localStorage
   */
  private saveTokens(tokens: AuthTokens): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken || null;
    this.tokenExpiry = tokens.expiresAt || Date.now() + 3600000; // 1 hour default

    localStorage.setItem('auth_token', tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem('refresh_token', tokens.refreshToken);
    }
    localStorage.setItem('token_expiry', String(this.tokenExpiry));
  }

  /**
   * Clear tokens from localStorage
   */
  private clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;

    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_expiry');
  }

  /**
   * Get authorization headers
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    return headers;
  }

  /**
   * Check if token needs refresh
   */
  private needsTokenRefresh(): boolean {
    return this.tokenExpiry > 0 && Date.now() > this.tokenExpiry - 300000; // 5 min buffer
  }

  /**
   * Generic HTTP request method
   */
  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    requiresAuth: boolean = true
  ): Promise<ApiResponse<T>> {
    // Check if we need to refresh token
    if (requiresAuth && this.needsTokenRefresh() && this.refreshToken) {
      await this.refreshTokens();
    }

    const url = `${this.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: this.getAuthHeaders(),
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      // Handle 401 Unauthorized
      if (response.status === 401 && requiresAuth) {
        if (this.refreshToken) {
          const refreshed = await this.refreshTokens();
          if (refreshed) {
            // Retry the request
            options.headers = this.getAuthHeaders();
            const retryResponse = await fetch(url, options);
            return this.parseResponse<T>(retryResponse);
          }
        }
        this.clearTokens();
        return { success: false, error: 'Authentication required' };
      }

      return this.parseResponse<T>(response);
    } catch (error) {
      console.error(`API request failed: ${method} ${endpoint}`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error' 
      };
    }
  }

  /**
   * Parse response from server
   */
  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (response.ok) {
        return { success: true, data };
      } else {
        return { 
          success: false, 
          error: data.error || data.message || `HTTP ${response.status}` 
        };
      }
    } catch (error) {
      return { success: false, error: 'Failed to parse response' };
    }
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Login user
   */
  async login(credentials: LoginCredentials): Promise<ApiResponse<{ user: UserProfile; tokens: AuthTokens }>> {
    const result = await this.request<{ user: UserProfile; token: string; refreshToken?: string }>(
      'POST',
      '/api/auth/login',
      credentials,
      false
    );

    if (result.success && result.data) {
      this.saveTokens({
        accessToken: result.data.token,
        refreshToken: result.data.refreshToken,
        expiresAt: Date.now() + 3600000
      });
    }

    return result as any;
  }

  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<ApiResponse<{ user: UserProfile }>> {
    return this.request('POST', '/api/auth/register', data, false);
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    await this.request('POST', '/api/auth/logout', {}, true);
    this.clearTokens();
  }

  /**
   * Refresh access token
   */
  async refreshTokens(): Promise<boolean> {
    if (!this.refreshToken) return false;

    const result = await this.request<{ token: string; refreshToken?: string }>(
      'POST',
      '/api/auth/refresh',
      { refreshToken: this.refreshToken },
      false
    );

    if (result.success && result.data) {
      this.saveTokens({
        accessToken: result.data.token,
        refreshToken: result.data.refreshToken || this.refreshToken,
        expiresAt: Date.now() + 3600000
      });
      return true;
    }

    return false;
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<ApiResponse<UserProfile>> {
    return this.request('GET', '/api/auth/profile');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  // ============================================
  // DELIVERIES
  // ============================================

  /**
   * Get all deliveries for current user
   */
  async getDeliveries(status?: string): Promise<ApiResponse<any[]>> {
    const query = status ? `?status=${status}` : '';
    return this.request('GET', `/api/delivery${query}`);
  }

  /**
   * Get specific delivery by ID
   */
  async getDelivery(id: string): Promise<ApiResponse<any>> {
    return this.request('GET', `/api/delivery/${id}`);
  }

  /**
   * Create new delivery
   */
  async createDelivery(data: any): Promise<ApiResponse<any>> {
    return this.request('POST', '/api/delivery', data);
  }

  /**
   * Update delivery
   */
  async updateDelivery(id: string, data: any): Promise<ApiResponse<any>> {
    return this.request('PUT', `/api/delivery/${id}`, data);
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(id: string, status: string): Promise<ApiResponse<any>> {
    return this.request('PATCH', `/api/delivery/${id}/status`, { status });
  }

  /**
   * Delete delivery
   */
  async deleteDelivery(id: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `/api/delivery/${id}`);
  }

  // ============================================
  // PROXIMITY TRACKING
  // ============================================

  /**
   * Send proximity update - main tracking endpoint
   * POST /api/proximity/update
   */
  async updateProximity(payload: ProximityUpdatePayload): Promise<ApiResponse<ProximityUpdateResponse>> {
    return this.request('POST', '/api/proximity/update', payload);
  }

  /**
   * Start proximity tracking session
   */
  async startProximityTracking(deliveryId: string): Promise<ApiResponse<{ trackingId: string }>> {
    return this.request('POST', '/api/proximity/start', { deliveryId });
  }

  /**
   * Stop proximity tracking session
   */
  async stopProximityTracking(trackingId: string): Promise<ApiResponse<void>> {
    return this.request('POST', '/api/proximity/stop', { trackingId });
  }

  /**
   * Get proximity history for a delivery
   */
  async getProximityHistory(deliveryId: string): Promise<ApiResponse<any[]>> {
    return this.request('GET', `/api/proximity/history/${deliveryId}`);
  }

  // ============================================
  // VENUES
  // ============================================

  /**
   * Get all venues
   */
  async getVenues(): Promise<ApiResponse<any[]>> {
    return this.request('GET', '/api/venues');
  }

  /**
   * Get venues within radius of location
   */
  async getNearbyVenues(lat: number, lon: number, radiusKm: number = 10): Promise<ApiResponse<any[]>> {
    return this.request('GET', `/api/venues/nearby?lat=${lat}&lon=${lon}&radius=${radiusKm}`);
  }

  /**
   * Get specific venue by ID
   */
  async getVenue(id: string): Promise<ApiResponse<any>> {
    return this.request('GET', `/api/venues/${id}`);
  }

  // ============================================
  // QR VERIFICATION
  // ============================================

  /**
   * Generate QR code for delivery
   */
  async generateQRCode(deliveryId: string): Promise<ApiResponse<{ qrCode: string; expiresAt: number }>> {
    return this.request('POST', `/api/delivery/${deliveryId}/qr/generate`);
  }

  /**
   * Verify QR code for delivery handoff
   */
  async verifyQRCode(deliveryId: string, code: string): Promise<ApiResponse<{ verified: boolean }>> {
    return this.request('POST', `/api/delivery/${deliveryId}/qr/verify`, { code });
  }

  /**
   * Complete delivery with verification
   */
  async completeDelivery(
    deliveryId: string, 
    verificationCode: string,
    location?: { latitude: number; longitude: number }
  ): Promise<ApiResponse<any>> {
    return this.request('POST', `/api/delivery/${deliveryId}/complete`, {
      verificationCode,
      location
    });
  }

  // ============================================
  // DEVICES
  // ============================================

  /**
   * Register device for push notifications
   */
  async registerDevice(deviceToken: string, platform: 'web' | 'ios' | 'android'): Promise<ApiResponse<void>> {
    return this.request('POST', '/api/device/register', { deviceToken, platform });
  }

  /**
   * Unregister device
   */
  async unregisterDevice(deviceToken: string): Promise<ApiResponse<void>> {
    return this.request('POST', '/api/device/unregister', { deviceToken });
  }

  // ============================================
  // UTILITY
  // ============================================

  /**
   * Set base URL (for testing or different environments)
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  /**
   * Get current base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<ApiResponse<{ status: string }>> {
    return this.request('GET', '/api/health', undefined, false);
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default ApiService;
