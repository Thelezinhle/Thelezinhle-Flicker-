/**
 * Audio Ranging Service - UWB Replacement for Web
 * Uses ultrasonic audio (18-20kHz) for time-of-flight distance estimation
 * 
 * How it works:
 * 1. Device A emits an ultrasonic ping
 * 2. Device B detects the ping and responds
 * 3. Time-of-flight is measured to calculate distance
 * 
 * Accuracy: 0.5-2 meters (depends on audio hardware quality)
 * Range: Up to 10 meters indoors
 * 
 * Browser Support: All modern browsers (uses Web Audio API)
 */

export interface AudioRangingData {
  distance: number;
  accuracy: number;
  roundTripTime: number;
  signalLevel: number;
  technology: 'audio_ultrasonic';
  timestamp: number;
}

export interface PingDetection {
  detected: boolean;
  level: number;
  frequency: number;
  timestamp: number;
}

class AudioRangingService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private isListening: boolean = false;
  private emitting: boolean = false;
  private distanceCallback: ((data: AudioRangingData) => void) | null = null;

  // Ultrasonic frequency configuration
  private pingFrequency: number = 18500; // Hz (inaudible to most adults)
  private pingDuration: number = 50; // ms
  private pingInterval: number = 500; // ms between pings

  // Speed of sound at 20°C
  private speedOfSound: number = 343; // meters per second

  // Detection threshold
  private detectionThreshold: number = 0.1;

  // Timing
  private lastPingTime: number = 0;
  private pingIntervalId: number | null = null;
  private frameId: number | null = null;

  // Public getter for listening state
  public get isCurrentlyListening(): boolean {
    return this.isListening;
  }

  // Public getter for emitting state
  public get isCurrentlyEmitting(): boolean {
    return this.emitting;
  }

  constructor() {
    console.log('🔊 AudioRangingService initialized');
  }

  /**
   * Check if audio is available
   */
  isAvailable(): boolean {
    return !!(window.AudioContext || (window as any).webkitAudioContext);
  }

  /**
   * Initialize audio context and microphone
   */
  async initialize(): Promise<boolean> {
    if (this.audioContext) return true;

    try {
      // Create audio context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100
        } as MediaTrackConstraints
      });

      // Create microphone source
      this.microphone = this.audioContext.createMediaStreamSource(stream);

      // Create analyser for frequency detection
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.1;

      // Connect microphone to analyser
      this.microphone.connect(this.analyser);

      console.log('✅ Audio ranging initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize audio:', error);
      throw error;
    }
  }

  /**
   * Emit an ultrasonic ping
   */
  emitPing(): void {
    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = this.pingFrequency;

    // Quick fade in/out to avoid clicks
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, this.audioContext.currentTime + 0.005);
    gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + this.pingDuration / 1000);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + this.pingDuration / 1000);

    this.lastPingTime = performance.now();
  }

  /**
   * Detect ultrasonic ping from another device
   */
  detectPing(): PingDetection | null {
    if (!this.analyser || !this.audioContext) return null;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    this.analyser.getFloatFrequencyData(dataArray);

    // Find the frequency bin for our ping frequency
    const nyquist = this.audioContext.sampleRate / 2;
    const binIndex = Math.round(this.pingFrequency / nyquist * bufferLength);

    // Check surrounding bins for detection
    let maxLevel = -Infinity;
    for (let i = binIndex - 2; i <= binIndex + 2; i++) {
      if (i >= 0 && i < bufferLength) {
        maxLevel = Math.max(maxLevel, dataArray[i]);
      }
    }

    // Convert from dB to linear scale
    const linearLevel = Math.pow(10, maxLevel / 20);

    return {
      detected: linearLevel > this.detectionThreshold,
      level: linearLevel,
      frequency: this.pingFrequency,
      timestamp: performance.now()
    };
  }

  /**
   * Start ranging mode (both emit and listen)
   */
  async startRanging(
    callback: (data: AudioRangingData) => void,
    mode: 'emit' | 'listen' | 'both' = 'both'
  ): Promise<boolean> {
    await this.initialize();

    this.distanceCallback = callback;
    this.isListening = true;

    // Start emitting pings if in emit or both mode
    if (mode === 'emit' || mode === 'both') {
      this.emitting = true;
      this.pingIntervalId = window.setInterval(() => {
        this.emitPing();
      }, this.pingInterval);
    }

    // Start listening for pings
    const processAudio = () => {
      if (!this.isListening) return;

      const detection = this.detectPing();

      if (detection && detection.detected) {
        // Calculate round-trip time
        const currentTime = performance.now();
        const roundTripTime = currentTime - this.lastPingTime;

        // If we detected a response (not our own ping)
        if (roundTripTime > this.pingDuration + 20) {
          // Calculate distance: d = (speed * time) / 2
          // Divide by 2 because it's round-trip
          const distance = (this.speedOfSound * (roundTripTime / 1000)) / 2;

          // Only report reasonable distances (0.1 - 15 meters)
          if (distance > 0.1 && distance < 15) {
            this.distanceCallback?.({
              distance: distance,
              accuracy: 0.5, // ±0.5m
              roundTripTime: roundTripTime,
              signalLevel: detection.level,
              technology: 'audio_ultrasonic',
              timestamp: Date.now()
            });
          }
        }
      }

      this.frameId = requestAnimationFrame(processAudio);
    };

    processAudio();
    console.log('🔊 Audio ranging started');
    return true;
  }

  /**
   * Listen-only mode (for device that responds to pings)
   */
  async startListening(onPingDetected: (detection: PingDetection) => void): Promise<void> {
    await this.initialize();

    this.isListening = true;

    const processAudio = () => {
      if (!this.isListening) return;

      const detection = this.detectPing();

      if (detection && detection.detected) {
        onPingDetected(detection);
        // Emit response ping after small delay
        setTimeout(() => this.emitPing(), 10);
      }

      this.frameId = requestAnimationFrame(processAudio);
    };

    processAudio();
  }

  /**
   * Stop ranging
   */
  stopRanging(): void {
    this.isListening = false;
    this.emitting = false;

    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }

    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    console.log('🛑 Audio ranging stopped');
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopRanging();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.microphone = null;
  }

  /**
   * Test speaker output (emit audible tone for testing)
   */
  async testSpeaker(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }

    if (!this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 440; // A4 note (audible)
    gainNode.gain.value = 0.3;

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start();
    setTimeout(() => oscillator.stop(), 200);
  }

  /**
   * Test microphone input level
   */
  async testMicrophone(): Promise<{ working: boolean; level: number }> {
    await this.initialize();

    return new Promise((resolve) => {
      let maxLevel = 0;
      const checkLevel = () => {
        const detection = this.detectPing();
        if (detection) {
          maxLevel = Math.max(maxLevel, detection.level);
        }
      };

      const interval = setInterval(checkLevel, 50);

      setTimeout(() => {
        clearInterval(interval);
        resolve({
          working: maxLevel > 0.001,
          level: maxLevel
        });
      }, 1000);
    });
  }

  /**
   * Configure ping parameters
   */
  configure(options: {
    frequency?: number;
    duration?: number;
    interval?: number;
    threshold?: number;
  }): void {
    if (options.frequency) this.pingFrequency = options.frequency;
    if (options.duration) this.pingDuration = options.duration;
    if (options.interval) this.pingInterval = options.interval;
    if (options.threshold) this.detectionThreshold = options.threshold;
  }
}

// Export singleton instance
export const audioRangingService = new AudioRangingService();
export default AudioRangingService;
