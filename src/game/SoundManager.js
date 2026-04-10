export class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.initialized = false;
        
        // Centralized State
        this.isMuted = false;
        this.volume = 0.1;

        // BGM Streamer
        this.bgmAudio = new Audio();
        this.bgmAudio.crossOrigin = "anonymous";
        this.bgmSource = null;
        
        this.tracks = [
            'assets/Birdie Breeze.mp3',
            'assets/Greenside Daydream.mp3',
            'assets/Whisper Greens.mp3'
        ];
        
        // Shuffle tracks cleanly for random first-play and shuffled sequential traversal
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
        
        this.currentTrackIndex = -1;
        
        // Loop logically
        this.bgmAudio.addEventListener('ended', () => {
            if (this.initialized) this.playNextTrack();
        });
    }

    init() {
        if (this.initialized) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.isMuted ? 0 : this.volume; // Apply UI mixed volume smoothly
        this.masterGain.connect(this.ctx.destination);
        
        // Stream HTML Audio gracefully into the Web Audio context
        this.bgmSource = this.ctx.createMediaElementSource(this.bgmAudio);
        
        // Dedicated BGM sub-gain natively to lightly suppress music under the loud physics sounds
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.gain.value = 0.45; 
        
        this.bgmSource.connect(this.bgmGain);
        this.bgmGain.connect(this.masterGain);
        
        this.initialized = true;
        this.playNextTrack();
    }

    playNextTrack() {
        if (!this.initialized) return;
        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.tracks.length;
        this.bgmAudio.src = this.tracks[this.currentTrackIndex];
        
        // Safely play securely isolating DOMExceptions from crashing generic browser restrictions
        const playPromise = this.bgmAudio.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => console.warn("BGM Auto-play blocked safely by browser natively.", e));
        }
    }

    setVolume(pct) {
        this.volume = pct;
        if (this.masterGain && !this.isMuted) {
            this.masterGain.gain.value = this.volume;
        }
    }

    setMuted(muted) {
        this.isMuted = muted;
        if (this.masterGain) {
            this.masterGain.gain.value = muted ? 0 : this.volume;
        }
    }

    _createNoiseBuffer(duration) {
        if (!this.ctx) return null;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    playHit(velocity = 1) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sine';
        // Classic snappy dull pop sound native to retro sports engines
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);

        // Map relative physics velocity (usually 1 to 20 dynamically) natively to volume
        const vol = Math.min(Math.max(velocity * 0.05, 0.02), 0.6);
        
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.08);
    }

    playSplash() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        
        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = this._createNoiseBuffer(0.6);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, t);
        filter.frequency.linearRampToValueAtTime(150, t + 0.6);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noiseSource.start(t);
    }

    playSunk() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        
        const playTone = (freq, startTime, dur, vol = 0.3) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(vol, startTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(startTime);
            osc.stop(startTime + dur);
        };

        // Clean Two-tone descending rewarding chime like Mario sinking
        playTone(550, t, 0.3, 0.3);
        playTone(350, t + 0.15, 0.4, 0.2);
    }

    playApplause() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const duration = 4.5;
        
        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = this._createNoiseBuffer(duration);

        // Filter radically bounds white noise strictly to sound like soft muffled claps organically
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 800; // soft human range
        filter.Q.value = 0.4;

        // Elegant Gaussian-like wave swelling mathematically mimicking crowd scaling up then dying down
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.8, t + 1.2);
        gain.gain.linearRampToValueAtTime(0.2, t + 3.5);
        gain.gain.linearRampToValueAtTime(0, t + duration);

        noiseSource.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noiseSource.start(t);
    }
}
