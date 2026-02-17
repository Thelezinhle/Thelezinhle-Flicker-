import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { API_BASE, SOCKET_URL } from '../config';

const API_URL = API_BASE;

export class HardwareService {
  private static instance: HardwareService;
  private socket: Socket | null = null;
  
  private constructor() {}
  
  public static getInstance(): HardwareService {
    if (!HardwareService.instance) {
      HardwareService.instance = new HardwareService();
    }
    return HardwareService.instance;
  }
  
  /**
   * Initialize Web Bluetooth connection
   */
  async initializeBluetooth(): Promise<boolean> {
    if (!('bluetooth' in navigator)) {
      console.warn('Web Bluetooth API not available');
      return false;
    }
    
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service']
      });
      
      await device.gatt.connect();
      console.log('Bluetooth connected:', device.name);
      return true;
    } catch (error) {
      console.error('Bluetooth connection failed:', error);
      return false;
    }
  }
  
  /**
   * Get current GPS location
   */
  async getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
        },
        (error) => {
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }
  
  /**
   * Initialize WebSocket connection for real-time updates
   */
  connectWebSocket(sessionId: string): void {
    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      query: { sessionId }
    });
    
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.socket?.emit('join-session', sessionId);
    });
    
    this.socket.on('location-update', (data) => {
      console.log('Location update received:', data);
      // Dispatch event for React components
      window.dispatchEvent(new CustomEvent('proximity-update', { detail: data }));
    });
    
    this.socket.on('light-id-signal', (data) => {
      console.log('Light-ID signal detected:', data);
      window.dispatchEvent(new CustomEvent('light-id-detected', { detail: data }));
    });
  }
  
  /**
   * Send location update via WebSocket
   */
  sendLocationUpdate(sessionId: string, latitude: number, longitude: number): void {
    if (this.socket?.connected) {
      this.socket.emit('update-location', {
        sessionId,
        latitude,
        longitude
      });
    }
  }
  
  /**
   * Initiate proximity handshake with backend
   */
  async initiateHandshake(userId: string): Promise<any> {
    try {
      const location = await this.getCurrentLocation();
      
      const response = await axios.post(`${API_URL}/proximity/initiate`, {
        initiatorId: userId,
        latitude: location.latitude,
        longitude: location.longitude
      });
      
      return response.data;
    } catch (error) {
      console.error('Failed to initiate handshake:', error);
      throw error;
    }
  }
  
  /**
   * Join existing handshake with code
   */
  async joinHandshake(handshakeCode: string, userId: string): Promise<any> {
    try {
      const location = await this.getCurrentLocation();
      
      const response = await axios.post(`${API_URL}/proximity/join`, {
        handshakeCode,
        receiverId: userId,
        latitude: location.latitude,
        longitude: location.longitude
      });
      
      // Connect WebSocket for this session
      if (response.data.data?.sessionId) {
        this.connectWebSocket(response.data.data.sessionId);
      }
      
      return response.data;
    } catch (error) {
      console.error('Failed to join handshake:', error);
      throw error;
    }
  }
  
  /**
   * Control device LED for Light-ID signaling
   * Note: This requires a hardware bridge or companion app
   */
  async controlLED(pattern: number[], frequency: number = 2000): Promise<void> {
    // This is a simulation - real implementation needs hardware bridge
    console.log(`LED Control: Pattern ${pattern} at ${frequency}Hz`);
    
    // For web demo, we'll simulate with screen flashes
    if (pattern.length > 0) {
      pattern.forEach((bit, index) => {
        setTimeout(() => {
          if (bit === 1) {
            // Flash screen white briefly
            document.body.style.backgroundColor = 'white';
            setTimeout(() => {
              document.body.style.backgroundColor = '';
            }, 1000 / frequency / 2);
          }
        }, index * (1000 / frequency));
      });
    }
  }
  
  /**
   * Use camera to detect Light-ID signals
   */
  async startLightIDDetection(
    videoElement: HTMLVideoElement,
    onDetection: (frequency: number, pattern: number[]) => void
  ): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          frameRate: { ideal: 60 }
        }
      });
      
      videoElement.srcObject = stream;
      
      // Simple light detection (real implementation would be more complex)
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const detectLight = () => {
        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          
          ctx?.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
          
          if (imageData) {
            // Analyze brightness changes for 2000Hz pattern
            const brightness = this.calculateBrightness(imageData);
            
            // Detect rapid brightness changes (simplified)
            if (brightness > 200) { // Threshold for "bright"
              onDetection(2000, [1, 0, 1, 0]); // Simulated pattern
            }
          }
        }
        
        requestAnimationFrame(detectLight);
      };
      
      detectLight();
    } catch (error) {
      console.error('Camera access failed:', error);
    }
  }
  
  private calculateBrightness(imageData: ImageData): number {
    let total = 0;
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      total += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    
    return total / (data.length / 4);
  }
  
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default HardwareService.getInstance();
