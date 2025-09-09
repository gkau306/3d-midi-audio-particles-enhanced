export class AudioManager {
  constructor() {
    navigator.mediaDevices.getUserMedia({ audio: true });
    this.context = new window.AudioContext();
    this.analyser = this.context.createAnalyser();
    this.analyser.smoothingTimeConstant = 0.7;
    this.analyser.fftSize = 2048;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(this.analyser.fftSize);
    this.audioElement = null;
    this.audioSource = null;
    this.isPlayingFile = false;
    this.currentMode = 'microphone'; // 'microphone' or 'file'
    this.audioBuffer = null;
    this.startTime = 0;
    this.pauseTime = 0;
    this.isPaused = false;
    document.addEventListener("click", async () => await this.resume());
    document.addEventListener("scroll", async () => await this.resume());
  }

  async resume() {
    if (this.context.state === "closed" || this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  async #registerStream(stream) {
    if (this.input) {
      this.input.disconnect(this.analyser);
    }
    this.input = this.context.createMediaStreamSource(stream);
    this.input.connect(this.analyser);
    await this.resume();
  }
  async getInputDevices() {
    return (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "audioinput"
    );
  }
  updateAudioInfo() {
    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeDomainData);
  }

  async getOutputDevices() {
    return (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "audiooutput"
    );
  }

  async listenTo(deviceId) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
    });
    await this.#registerStream(stream);
    this.currentMode = 'microphone';
  }

  async loadAudioFile(file) {
    try {
      // Stop current audio if playing
      if (this.audioElement) {
        this.audioElement.pause();
        this.audioElement = null;
      }
      if (this.audioSource) {
        this.audioSource.disconnect();
        this.audioSource = null;
      }

      // Create audio element
      this.audioElement = new Audio();
      this.audioElement.crossOrigin = "anonymous";
      this.audioElement.loop = true;
      
      // Create audio source from file
      const arrayBuffer = await file.arrayBuffer();
      this.audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      
      this.currentMode = 'file';
      this.isPlayingFile = true;
      this.isPaused = false;
      this.startTime = 0;
      this.pauseTime = 0;
      
      await this.resume();
      
      // Start playback automatically
      this.#startPlayback();
      
      return true;
    } catch (error) {
      console.error('Error loading audio file:', error);
      return false;
    }
  }

  #startPlayback() {
    if (!this.audioBuffer || this.currentMode !== 'file') return;
    
    // Stop current source if playing
    if (this.audioSource) {
      this.audioSource.stop();
      this.audioSource.disconnect();
    }
    
    // Create new source
    this.audioSource = this.context.createBufferSource();
    this.audioSource.buffer = this.audioBuffer;
    this.audioSource.loop = true;
    
    // Connect to analyser
    this.audioSource.connect(this.analyser);
    this.analyser.connect(this.context.destination);
    
    // Start playback
    const offset = this.isPaused ? this.pauseTime : 0;
    this.audioSource.start(0, offset);
    this.startTime = this.context.currentTime - offset;
    this.isPaused = false;
  }

  playAudioFile() {
    if (this.currentMode === 'file' && this.audioBuffer) {
      this.#startPlayback();
    }
  }

  pauseAudioFile() {
    if (this.audioSource && this.currentMode === 'file' && !this.isPaused) {
      this.pauseTime = this.context.currentTime - this.startTime;
      this.audioSource.stop();
      this.audioSource.disconnect();
      this.audioSource = null;
      this.isPaused = true;
    }
  }

  stopAudioFile() {
    if (this.audioSource && this.currentMode === 'file') {
      this.audioSource.stop();
      this.audioSource.disconnect();
      this.audioSource = null;
    }
    this.isPlayingFile = false;
    this.isPaused = false;
    this.startTime = 0;
    this.pauseTime = 0;
  }

  setMode(mode) {
    this.currentMode = mode;
  }

  getCurrentMode() {
    return this.currentMode;
  }
}
