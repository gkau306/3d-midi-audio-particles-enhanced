import { MidiControllerFactory, MidiMapper } from "./midi.js";
import { AudioManager as AudioInterfaceController } from "./audio.js";
import * as THREE from "three";

export class AudioMidiParticlesController {
  constructor(particles) {
    this.particles = particles;

    this.clock = new THREE.Clock();

    this.params = {
      amplitude: 3,
      frequency: 0.01,
      maxDistance: 3,
      freq1: 60,
      freq2: 500,
      freq3: 6000,
      timeX: 2,
      timeY: 20,
      timeZ: 10,
      interpolation: 0.06,
      // Color analysis parameters
      colorMode: 'frequency', // 'frequency', 'beat', 'mood', 'custom'
      colorIntensity: 1.0,
      colorSpeed: 1.0,
      beatThreshold: 0.3,
      moodSensitivity: 0.5,
    };

    // Color analysis state
    this.colorAnalysis = {
      currentColor: new THREE.Color(0xffffff),
      targetColor: new THREE.Color(0xffffff),
      beatDetected: false,
      lastBeatTime: 0,
      energyLevel: 0,
      moodScore: 0,
      frequencyColors: {
        bass: new THREE.Color(0x1a1a2e),      // Deep blue
        mid: new THREE.Color(0x16213e),        // Dark blue
        treble: new THREE.Color(0x0f3460),     // Medium blue
        high: new THREE.Color(0x533483),       // Purple
      },
      moodColors: {
        calm: new THREE.Color(0x4a90e2),       // Calm blue
        energetic: new THREE.Color(0xff6b6b),  // Energetic red
        happy: new THREE.Color(0xffd93d),     // Happy yellow
        mysterious: new THREE.Color(0x6c5ce7), // Mysterious purple
      }
    };
  }

  static async create(particles) {
    const audioMidiParticlesBinder = new AudioMidiParticlesController(
      particles
    );
    await audioMidiParticlesBinder.#setupAudioControls();
    await audioMidiParticlesBinder.#setupMidiControls();
    return audioMidiParticlesBinder;
  }

  async #setupAudioControls() {
    try {
      this.audioInterfaceController = new AudioInterfaceController();
      this.audioDevices = await this.audioInterfaceController.getInputDevices();
      
      // Only set up microphone if devices are available
      if (this.audioDevices.length > 0) {
        this.audioInterfaceController.listenTo(this.audioDevices[0].deviceId);
      } else {
        console.log('No microphone devices found. File upload mode will be available.');
      }
    } catch (err) {
      console.log('Audio setup error:', err);
    }
  }

  async #setupMidiControls() {
    try {
      this.midiController = await MidiControllerFactory.createController();
      const inputs = [];
      for (const [id, midiInput] of this.midiController.getInputs()) {
        inputs.push(midiInput);
      }
      const midiInterface = inputs[0];
      if (!midiInterface) return;
      this.midiController.setActiveMidiInterface(midiInterface);
      this.midiMapper = new MidiMapper(this.midiController, this.params);
      this.midiAvailable = true;
    } catch (err) {
      console.log(err);
      this.midiAvailable = false;
    }
  }

  #hertzToIndex(hz) {
    return Math.floor(
      (hz * this.audioInterfaceController.analyser.frequencyBinCount) /
        (this.audioInterfaceController.context.sampleRate / 2)
    );
  }

  #processAudio() {
    // Only process audio if we have an active audio source
    if (!this.audioInterfaceController.analyser) return;
    
    this.audioInterfaceController.updateAudioInfo();

    const freq1Index = this.#hertzToIndex(this.params.freq1);
    const freq2Index = this.#hertzToIndex(this.params.freq2);
    const freq3Index = this.#hertzToIndex(this.params.freq3);

    const freqValue1 = this.audioInterfaceController.freqData[freq1Index];
    this.frequencyValue1 = freqValue1 / 255;

    const freqValue2 =
      this.audioInterfaceController.freqData[Math.floor(freq2Index)];
    this.frequencyValue2 = freqValue2 / 255;

    const freqValue3 =
      this.audioInterfaceController.freqData[Math.floor(freq3Index)];
    this.frequencyValue3 = freqValue3 / 255;

    this.timeDomainValue =
      (128 -
        this.audioInterfaceController.timeDomainData[
          Math.floor(this.audioInterfaceController.analyser.fftSize / 2)
        ]) /
      127;

    // Process color analysis
    this.#analyzeColors();
  }

  #analyzeColors() {
    const currentTime = this.clock.getElapsedTime();
    
    // Calculate energy level from frequency data
    this.colorAnalysis.energyLevel = (this.frequencyValue1 + this.frequencyValue2 + this.frequencyValue3) / 3;
    
    // Beat detection
    this.#detectBeat();
    
    // Analyze mood based on frequency distribution
    this.#analyzeMood();
    
    // Update target color based on mode
    this.#updateTargetColor();
    
    // Smoothly transition to target color
    this.#transitionColor(currentTime);
  }

  #detectBeat() {
    const currentTime = this.clock.getElapsedTime();
    const timeSinceLastBeat = currentTime - this.colorAnalysis.lastBeatTime;
    
    // Simple beat detection based on bass frequency and time domain
    const bassIntensity = this.frequencyValue1;
    const overallIntensity = this.timeDomainValue;
    
    if (bassIntensity > this.params.beatThreshold && 
        overallIntensity > 0.2 && 
        timeSinceLastBeat > 0.3) {
      this.colorAnalysis.beatDetected = true;
      this.colorAnalysis.lastBeatTime = currentTime;
    } else {
      this.colorAnalysis.beatDetected = false;
    }
  }

  #analyzeMood() {
    // Analyze mood based on frequency distribution
    const bassRatio = this.frequencyValue1;
    const midRatio = this.frequencyValue2;
    const trebleRatio = this.frequencyValue3;
    
    // Calculate mood score (-1 to 1)
    let moodScore = 0;
    
    // High bass = energetic/mysterious
    if (bassRatio > 0.7) moodScore += 0.3;
    
    // High mid = happy/energetic
    if (midRatio > 0.7) moodScore += 0.4;
    
    // High treble = happy/energetic
    if (trebleRatio > 0.7) moodScore += 0.3;
    
    // Low overall energy = calm
    if (this.colorAnalysis.energyLevel < 0.3) moodScore -= 0.5;
    
    this.colorAnalysis.moodScore = Math.max(-1, Math.min(1, moodScore));
  }

  #updateTargetColor() {
    switch (this.params.colorMode) {
      case 'frequency':
        this.#updateFrequencyColor();
        break;
      case 'beat':
        this.#updateBeatColor();
        break;
      case 'mood':
        this.#updateMoodColor();
        break;
      case 'custom':
        // Custom color mode - can be extended
        this.#updateCustomColor();
        break;
    }
  }

  #updateFrequencyColor() {
    // Blend colors based on frequency dominance
    const bassWeight = this.frequencyValue1;
    const midWeight = this.frequencyValue2;
    const trebleWeight = this.frequencyValue3;
    const highWeight = Math.max(0, this.frequencyValue3 - 0.5);
    
    const totalWeight = bassWeight + midWeight + trebleWeight + highWeight;
    
    if (totalWeight > 0) {
      const bassColor = this.colorAnalysis.frequencyColors.bass.clone();
      const midColor = this.colorAnalysis.frequencyColors.mid.clone();
      const trebleColor = this.colorAnalysis.frequencyColors.treble.clone();
      const highColor = this.colorAnalysis.frequencyColors.high.clone();
      
      // Blend colors based on weights
      bassColor.multiplyScalar(bassWeight / totalWeight);
      midColor.multiplyScalar(midWeight / totalWeight);
      trebleColor.multiplyScalar(trebleWeight / totalWeight);
      highColor.multiplyScalar(highWeight / totalWeight);
      
      this.colorAnalysis.targetColor = bassColor.add(midColor).add(trebleColor).add(highColor);
    }
  }

  #updateBeatColor() {
    if (this.colorAnalysis.beatDetected) {
      // Flash bright color on beat
      const beatColors = [
        new THREE.Color(0xff0000), // Red
        new THREE.Color(0x00ff00), // Green
        new THREE.Color(0x0000ff), // Blue
        new THREE.Color(0xffff00), // Yellow
        new THREE.Color(0xff00ff), // Magenta
        new THREE.Color(0x00ffff), // Cyan
      ];
      
      const randomIndex = Math.floor(Math.random() * beatColors.length);
      this.colorAnalysis.targetColor = beatColors[randomIndex];
    } else {
      // Fade to darker color
      this.colorAnalysis.targetColor = new THREE.Color(0x333333);
    }
  }

  #updateMoodColor() {
    const moodScore = this.colorAnalysis.moodScore;
    
    if (moodScore > 0.5) {
      // Happy/Energetic
      this.colorAnalysis.targetColor = this.colorAnalysis.moodColors.happy.clone();
    } else if (moodScore > 0) {
      // Energetic
      this.colorAnalysis.targetColor = this.colorAnalysis.moodColors.energetic.clone();
    } else if (moodScore > -0.5) {
      // Mysterious
      this.colorAnalysis.targetColor = this.colorAnalysis.moodColors.mysterious.clone();
    } else {
      // Calm
      this.colorAnalysis.targetColor = this.colorAnalysis.moodColors.calm.clone();
    }
    
    // Adjust intensity based on energy level
    const intensity = Math.max(0.3, this.colorAnalysis.energyLevel * this.params.colorIntensity);
    this.colorAnalysis.targetColor.multiplyScalar(intensity);
  }

  #updateCustomColor() {
    // Custom color mode - can be extended with user-defined colors
    this.colorAnalysis.targetColor = new THREE.Color(0xffffff);
  }

  #transitionColor(currentTime) {
    const speed = this.params.colorSpeed * 0.1;
    this.colorAnalysis.currentColor.lerp(this.colorAnalysis.targetColor, speed);
  }

  #updateParams() {
    let amplitude = this.params.amplitude;

    let frequency = this.params.frequency;

    let maxDistance = this.params.maxDistance - this.timeDomainValue;

    let timeX = this.params.timeX * this.frequencyValue1;

    let timeY = this.params.timeY * this.frequencyValue2;

    let timeZ = this.params.timeZ * this.frequencyValue3;

    let interpolation = this.params.interpolation;

    return {
      amplitude,
      frequency,
      timeX,
      timeY,
      timeZ,
      maxDistance,
      interpolation,
    };
  }

  update() {
    const elapsedTime = this.clock.getElapsedTime();
    const {
      amplitude,
      frequency,
      timeX,
      timeY,
      timeZ,
      maxDistance,
      interpolation,
    } = this.#updateParams();
    this.#processAudio();
    this.particles.setTimeElapsed(elapsedTime);
    this.particles.setAmplitude(amplitude);
    this.particles.setFrequency(frequency);
    this.particles.setMaxDistance(maxDistance);
    this.particles.setTimeMultiplierX(timeX);
    this.particles.setTimeMultiplierY(timeY);
    this.particles.setTimeMultiplierZ(timeZ);
    this.particles.setInterpolation(interpolation);
    
    // Update particle color based on analysis
    this.particles.setColor(this.colorAnalysis.currentColor);
  }
}
