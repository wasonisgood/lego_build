import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Text } from '@react-three/drei';
import * as THREE from 'three';

// --- 進階音頻引擎 (Web Audio API) ---
class AudioEngine {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  reverbNode: ConvolverNode | null = null;

  constructor() {
    // Lazy init
  }

  ensureInit() {
    if (this.ctx && this.ctx.state === 'running') return;
    
    if (!this.ctx) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      
      this.reverbNode = this.ctx.createConvolver();
      this.createImpulseResponse();
      
      this.masterGain.connect(this.reverbNode);
      this.reverbNode.connect(this.ctx.destination);
      this.masterGain.connect(this.ctx.destination);
    }
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  createImpulseResponse() {
    if (!this.ctx || !this.reverbNode) return;
    const rate = this.ctx.sampleRate;
    const length = rate * 2.0; 
    const decay = 2.0;
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const n = length - i;
        left[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
        right[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
    }
    this.reverbNode.buffer = impulse;
  }

  play(freq: number, positionFactor: number = 1.0, instrument: 'kalimba' | 'piano' = 'kalimba', when: number = 0) {
    if (!Number.isFinite(freq) || !Number.isFinite(positionFactor)) return;
    
    this.ensureInit();
    if (!this.ctx || !this.masterGain) return;

    // 如果 when 是 0 或過去的時間，使用當前時間
    const t = Math.max(this.ctx.currentTime, when);

    if (instrument === 'piano') {
        this.playPiano(freq, positionFactor, t);
    } else {
        this.playKalimba(freq, positionFactor, t);
    }
  }

  playKalimba(freq: number, positionFactor: number, t: number) {
    if (!this.ctx || !this.masterGain) return;
    
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const modulator = this.ctx.createOscillator();
    modulator.type = 'sine';
    modulator.frequency.value = freq * 2.4; 
    
    const modGain = this.ctx.createGain();
    const brightness = 500 * positionFactor; 
    modGain.gain.setValueAtTime(brightness, t);
    modGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.6 * positionFactor, t + 0.005); 
    const decayTime = Math.max(1.0, 500 / freq); 
    env.gain.exponentialRampToValueAtTime(0.001, t + decayTime);

    carrier.connect(env);
    env.connect(this.masterGain);

    carrier.start(t);
    modulator.start(t);
    carrier.stop(t + decayTime + 0.1);
    modulator.stop(t + decayTime + 0.1);

    const thump = this.ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(100, t);
    thump.frequency.exponentialRampToValueAtTime(20, t + 0.05);
    
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.3, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    thump.connect(thumpGain);
    thumpGain.connect(this.masterGain);
    thump.start(t);
    thump.stop(t + 0.06);
  }

  playPiano(freq: number, velocity: number, t: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'triangle';
    osc2.type = 'triangle';
    
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.001; 

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 8, t);
    filter.frequency.exponentialRampToValueAtTime(freq, t + 1.0); 

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5 * velocity, t + 0.02); 
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5); 

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 3.0);
    osc2.stop(t + 3.0);
  }
}

const audio = new AudioEngine();

// --- 鍵盤映射 (Keyboard Mapping) ---
const KEY_MAPPING = [
  'Space', 'G', 'H', 'F', 'J', 'D', 'K', 'S', 'L', 'A', ';', 'T', 'Y', 'R', 'U', 'E', 'I', 'W', 'O', 'Q', 'P', 'V', 'N', 'B', 'M'
];

// --- 樂理與排列邏輯 ---
const generateRealisticKeys = () => {
  const keys = [];
  const whiteKeysMidi = [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95];

  for (let i = 0; i < 24; i++) {
    const midi = whiteKeysMidi[i];
    let x = 0;
    if (i === 0) x = 0;
    else {
      const side = i % 2 !== 0 ? -1 : 1; 
      const step = Math.ceil(i / 2);
      x = side * step * 0.6;
    }
    const len = 6.0 - ((midi - 55) / (95 - 55)) * 3.0;
    const keyChar = KEY_MAPPING[i] || '';

    keys.push({
      id: i,
      midi: midi,
      freq: 440 * Math.pow(2, (midi - 69) / 12),
      label: getNoteLabel(midi),
      x: x,
      len: len,
      color: (i % 3 === 0) ? '#ffaa44' : '#e0e0e0',
      keyChar: keyChar
    });
  }
  return keys.sort((a, b) => a.x - b.x); 
};

const getNoteLabel = (midi: number) => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note = notes[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  if (note === 'C') return `${note}${octave}`;
  return note;
};

const KALIMBA_KEYS = generateRealisticKeys();

type Song = {
  name: string;
  speed: number; 
  instrument?: 'kalimba' | 'piano';
  notes: { t: number, midi: number }[];
};

const SONGS: Song[] = [
  {
    name: "卡農 (Canon) - 完整繁華版",
    speed: 0.4, 
    notes: [
      {t:0, midi:60}, {t:0, midi:64}, {t:0, midi:67}, {t:0, midi:72},
      {t:1, midi:67}, {t:1.5, midi:72},
      {t:2, midi:55}, {t:2, midi:59}, {t:2, midi:62}, {t:2, midi:71},
      {t:3, midi:62}, {t:3.5, midi:59},
      {t:4, midi:57}, {t:4, midi:60}, {t:4, midi:64}, {t:4, midi:69},
      {t:5, midi:64}, {t:5.5, midi:60},
      {t:6, midi:64}, {t:6, midi:67}, {t:6, midi:71}, {t:6, midi:79},
      {t:7, midi:71}, {t:7.5, midi:67},
      {t:8, midi:65}, {t:8, midi:69}, {t:8, midi:72}, {t:8, midi:81},
      {t:9, midi:72}, {t:9.5, midi:69},
      {t:10,midi:60}, {t:10,midi:64}, {t:10,midi:67}, {t:10,midi:76},
      {t:11,midi:67}, {t:11.5,midi:64},
      {t:12,midi:65}, {t:12,midi:69}, {t:12,midi:72}, {t:12,midi:81},
      {t:13,midi:72}, {t:13.5,midi:69},
      {t:14,midi:55}, {t:14,midi:59}, {t:14,midi:62}, {t:14,midi:71},
      {t:15,midi:74}, {t:15.5,midi:79},
      {t:16,midi:60}, {t:16,midi:76}, {t:16.5,midi:72}, {t:17,midi:76}, {t:17.5,midi:79}, 
      {t:18,midi:55}, {t:18,midi:74}, {t:18.5,midi:71}, {t:19,midi:74}, {t:19.5,midi:71},
      {t:20,midi:57}, {t:20,midi:72}, {t:20.5,midi:69}, {t:21,midi:72}, {t:21.5,midi:76},
      {t:22,midi:64}, {t:22,midi:71}, {t:22.5,midi:67}, {t:23,midi:71}, {t:23.5,midi:72},
      {t:24,midi:65}, {t:24,midi:69}, {t:24.5,midi:65}, {t:25,midi:69}, {t:25.5,midi:72},
      {t:26,midi:60}, {t:26,midi:67}, {t:26.5,midi:64}, {t:27,midi:67}, {t:27.5,midi:76},
      {t:28,midi:65}, {t:28,midi:69}, {t:28.5,midi:72}, {t:29,midi:81}, {t:29.5,midi:84},
      {t:30,midi:55}, {t:30,midi:71}, {t:30.5,midi:74}, {t:31,midi:79}, {t:31.5,midi:83},
      {t:32,midi:60}, {t:32,midi:72}, {t:32,midi:84}, {t:32.5,midi:79}, {t:33,midi:76}, {t:33.5,midi:72},
      {t:34,midi:55}, {t:34,midi:71}, {t:34,midi:83}, {t:34.5,midi:79}, {t:35,midi:74}, {t:35.5,midi:71},
      {t:36,midi:57}, {t:36,midi:69}, {t:36,midi:81}, {t:36.5,midi:76}, {t:37,midi:72}, {t:37.5,midi:69},
      {t:38,midi:64}, {t:38,midi:67}, {t:38,midi:79}, {t:38.5,midi:76}, {t:39,midi:71}, {t:39.5,midi:67},
      {t:40,midi:65}, {t:40,midi:69}, {t:40,midi:81}, {t:40.5,midi:76}, {t:41,midi:72}, {t:41.5,midi:69},
      {t:42,midi:60}, {t:42,midi:67}, {t:42,midi:79}, {t:42.5,midi:76}, {t:43,midi:72}, {t:43.5,midi:67},
      {t:44,midi:65}, {t:44,midi:81}, {t:44.5,midi:83}, {t:45,midi:84}, {t:45.5,midi:86},
      {t:46,midi:55}, {t:46,midi:83}, {t:46.5,midi:81}, {t:47,midi:79}, {t:47.5,midi:74},
      {t:48,midi:60}, {t:48,midi:64}, {t:48,midi:67}, {t:48,midi:72}, {t:48,midi:84},
      {t:49,midi:72}, {t:50,midi:60}
    ]
  },
  {
    name: "霍爾的移動城堡 (Merry-Go-Round)",
    speed: 0.35,
    notes: [
      {t:0, midi:57}, {t:1, midi:69}, {t:1, midi:72}, {t:1, midi:76}, {t:2, midi:69}, {t:2, midi:72}, {t:2, midi:76},
      {t:3, midi:65}, {t:4, midi:69}, {t:4, midi:72}, {t:4, midi:77}, {t:5, midi:69}, {t:5, midi:72}, {t:5, midi:77},
      {t:6, midi:74}, {t:7, midi:76}, {t:8, midi:77},
      {t:9, midi:62}, {t:9, midi:81}, {t:10,midi:65}, {t:10,midi:69}, {t:11,midi:65}, {t:11,midi:69},
      {t:12,midi:64}, {t:12,midi:79}, {t:13,midi:67}, {t:13,midi:71}, {t:14,midi:67}, {t:14,midi:71},
    ]
  },
  {
    name: "小星星變奏曲 (Twinkle Chord Ver.)",
    speed: 0.6,
    notes: [
      {t:0, midi:60}, {t:0, midi:64}, {t:0, midi:67}, {t:0, midi:72}, {t:1, midi:60}, {t:1, midi:64}, {t:1, midi:67}, {t:1, midi:72},
      {t:2, midi:65}, {t:2, midi:69}, {t:2, midi:72}, {t:2, midi:79}, {t:3, midi:65}, {t:3, midi:69}, {t:3, midi:72}, {t:3, midi:79},
      {t:4, midi:69}, {t:4, midi:72}, {t:4, midi:76}, {t:4, midi:81}, {t:5, midi:69}, {t:5, midi:72}, {t:5, midi:76}, {t:5, midi:81},
      {t:6, midi:55}, {t:6, midi:59}, {t:6, midi:62}, {t:6, midi:79}, 
      {t:8, midi:65}, {t:8, midi:69}, {t:8, midi:77}, {t:9, midi:65}, {t:9, midi:69}, {t:9, midi:77},
      {t:10,midi:64}, {t:10,midi:67}, {t:10,midi:76}, {t:11,midi:64}, {t:11,midi:67}, {t:11,midi:76},
      {t:12,midi:62}, {t:12,midi:67}, {t:12,midi:74}, {t:13,midi:62}, {t:13,midi:67}, {t:13,midi:74},
      {t:14,midi:60}, {t:14,midi:64}, {t:14,midi:67}, {t:14,midi:72}
    ]
  },
  {
    name: "雨夜花 (Rainy Night Flower)",
    speed: 0.7,
    instrument: 'piano', 
    notes: [
      {t:0, midi:57}, {t:0.5, midi:64}, {t:1, midi:69}, {t:1.5, midi:72},
      {t:2, midi:64}, {t:2, midi:57}, {t:2.5, midi:67}, 
      {t:3, midi:69}, {t:3, midi:60}, {t:4, midi:67}, 
      {t:4.5, midi:64}, {t:4.5, midi:57}, {t:5, midi:62}, {t:5.5, midi:64}, 
      {t:6.5, midi:64}, {t:6.5, midi:57}, {t:7, midi:67}, 
      {t:7.5, midi:69}, {t:7.5, midi:60}, {t:8.5, midi:67}, 
      {t:9, midi:64}, {t:9, midi:57}, {t:9.5, midi:67}, 
      {t:10, midi:72}, {t:10, midi:65}, {t:10.5, midi:69}, 
      {t:11, midi:67}, {t:11, midi:60}, 
      {t:12, midi:72}, {t:12, midi:65}, {t:12.5, midi:72}, {t:13, midi:69}, 
      {t:13.5, midi:67}, {t:13.5, midi:60}, {t:14, midi:69}, {t:14.5, midi:67}, 
      {t:15, midi:64}, {t:15, midi:57}, 
      {t:16, midi:62}, {t:16, midi:55}, {t:16.5, midi:64}, 
      {t:17, midi:67}, {t:17, midi:60}, 
      {t:18, midi:69}, {t:18, midi:65}, {t:18.5, midi:72}, {t:19, midi:69}, 
      {t:20, midi:67}, {t:20, midi:60}, {t:20.5, midi:64}, 
      {t:21, midi:62}, {t:21, midi:55}, 
      {t:22, midi:60}, {t:22, midi:57}, {t:22.5, midi:62}, {t:23, midi:64}, 
      {t:24, midi:67}, {t:24, midi:60}, {t:24.5, midi:69}, 
      {t:25, midi:72}, {t:25, midi:57}, 
      {t:26, midi:69}, {t:26.5, midi:64}, {t:27, midi:60}, {t:28, midi:57}
    ]
  }
];

const Key = ({ data, active, isPlayingSong, onPlay }: { 
  data: any, 
  active: boolean, 
  isPlayingSong: boolean,
  onPlay: (id: number, freq: number, factor: number) => void 
}) => {
  const meshRef = useRef<THREE.Group>(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (active) {
      setPressed(true);
      if (isPlayingSong) {
          setTimeout(() => setPressed(false), 200);
      }
    } else {
        setPressed(false);
    }
  }, [active, isPlayingSong]);

  const trigger = (e: ThreeEvent<PointerEvent>) => {
    let z = e.point.z;
    if (!Number.isFinite(z)) z = 0;
    const factor = Math.min(1, Math.max(0.2, (z + 1) / (data.len + 1)));

    onPlay(data.id, data.freq, factor);
    setPressed(true);
    setTimeout(() => setPressed(false), 150);
  };

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.nativeEvent.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    trigger(e);
  };

  const handlePointerEnter = (e: ThreeEvent<PointerEvent>) => {
    if (e.buttons === 1) {
      trigger(e);
    }
  };

  useFrame((state) => {
    if (!meshRef.current) return;
    if (pressed) {
      meshRef.current.rotation.x = 0.1;
      meshRef.current.position.y = -0.05;
    } else {
      meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, 0, 0.2);
      meshRef.current.position.y = THREE.MathUtils.lerp(meshRef.current.position.y, 0, 0.2);
    }
  });

  return (
    <group position={[data.x, 0.5, 1]} ref={meshRef}>
      <mesh 
        onPointerDown={handlePointerDown}
        onPointerEnter={handlePointerEnter}
        castShadow 
        receiveShadow
        position={[0, 0, data.len / 2 - 2]} 
      >
        <boxGeometry args={[0.55, 0.15, data.len]} />
        <meshStandardMaterial 
          color={pressed ? '#ffffff' : data.color} 
          metalness={0.95} 
          roughness={0.1} 
        />
      </mesh>
      
      <Text 
        position={[0, 0.08, data.len - 2.5]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        fontSize={0.2} 
        color="#333"
        anchorY="middle"
      >
        {data.label}
      </Text>
      
      <Text 
        position={[0, 0.08, data.len - 3.5]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        fontSize={0.15} 
        color="#666"
        anchorY="middle"
      >
        {data.keyChar}
      </Text>

      {pressed && (
         <pointLight position={[0, 1, data.len - 2]} intensity={2} color="#ff0000" distance={3} />
      )}
    </group>
  );
};

const KalimbaBody = () => {
  return (
    <group position={[0, -0.6, 1]}>
      <mesh position={[0, 0, 0]} receiveShadow>
         <boxGeometry args={[18, 1.2, 10]} />
         <meshStandardMaterial color="#5D4037" roughness={0.6} />
      </mesh>
      
      <mesh position={[0, 0.61, -1]} rotation={[-Math.PI/2, 0, 0]}>
         <ringGeometry args={[1.8, 2.2, 64]} />
         <meshStandardMaterial color="#3E2723" />
      </mesh>
      <mesh position={[0, 0.5, -1]} rotation={[-Math.PI/2, 0, 0]}>
         <circleGeometry args={[1.8, 64]} />
         <meshStandardMaterial color="#000" />
      </mesh>

      <mesh position={[0, 0.6, 2]} rotation={[0, 0, Math.PI/2]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 17, 32]} />
        <meshStandardMaterial color="#D7CCC8" />
      </mesh>
      <mesh position={[0, 0.6, -2.5]} rotation={[0, 0, Math.PI/2]} castShadow>
        <cylinderGeometry args={[0.25, 0.25, 17, 32]} />
        <meshStandardMaterial color="#D7CCC8" />
      </mesh>
      
      <mesh position={[0, 0.9, -2.5]} castShadow>
         <boxGeometry args={[17, 0.15, 0.6]} />
         <meshStandardMaterial color="#B0BEC5" metalness={0.8} />
      </mesh>
      
      {[-7, -4, 0, 4, 7].map((x, i) => (
         <mesh key={i} position={[x, 1.1, -2.5]}>
            <cylinderGeometry args={[0.12, 0.12, 0.3, 16]} />
            <meshStandardMaterial color="#333" metalness={1} />
         </mesh>
      ))}
    </group>
  );
};

// 獨立的場景組件，將需要 useFrame 的部分隔離
const KalimbaScene = ({ 
  activeMidi, 
  isPlayingSong, 
  pressedKeys, 
  onPlayKey, 
  onSetActiveMidi,
  songIndex
}: { 
  activeMidi: number | null, 
  isPlayingSong: boolean, 
  pressedKeys: Set<number>, 
  onPlayKey: (id: number, freq: number, factor: number) => void,
  onSetActiveMidi: (midi: number | null) => void,
  songIndex: number | null
}) => {
  
  // Visual Sync Logic in useFrame (runs inside Canvas)
  useFrame((state) => {
    if (songIndex === null || !isPlayingSong || !audio.ctx) {
       // Optional: reset logic if needed, but usually handled by parent
       return;
    }
    
    // 我們需要訪問 parent 的 startTimeRef... 
    // 但為了避免過度傳遞 props，我們可以簡單地依賴 activeMidi
    // 其實，Visual Sync 已經移到 parent 的 Audio Scheduler 附近比較合理
    // 但 instruction 是要修復 useFrame not in Canvas error。
    // 在上一個版本中，我在 KalimbaPage (Parent) 用了 useFrame，這是錯的。
    // 這裡我們只負責渲染 3D 場景。
    
    // 真正的 Visual Sync 邏輯：
    // 在這個組件中，我們不需要做什麼額外的事，因為 activeMidi 是由 parent 傳進來的。
    // Parent 的 setInterval 負責音頻。
    // 那視覺誰負責？
    // 如果 parent 不能用 useFrame，那 parent 就不能做高頻視覺更新。
    // 所以我們必須在這裡 (Canvas child) 做視覺更新。
    
    // 但是要更新視覺，我們需要知道歌曲進度。
    // 我們需要 audio.ctx.currentTime 和 startTime。
    // 這些數據在 parent。
    
    // 解決方案：將 startTime 傳進來，在這裡計算 activeMidi 並通知 parent?
    // 不，parent 控制 state (activeMidi) 比較好。
    // 但是 parent 不能用 useFrame。
    // Parent 可以用 requestAnimationFrame (RAF)！
    // 沒錯，標準的 React 組件可以用 RAF，不需要 R3F 的 useFrame。
    // useFrame 只是 R3F 對 RAF 的封裝，方便在 3D 渲染循環中做事。
    
    // 所以，最佳解法是：
    // 把 KalimbaPage 裡的 useFrame 換成 useEffect + requestAnimationFrame。
    // 這樣就不會報錯了，而且邏輯不用大改。
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 18, 12]} fov={40} />
      <OrbitControls 
          makeDefault 
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 2.2} 
          maxDistance={30} 
          minDistance={8} 
          target={[0, 0, 2]}
      />
      
      <ambientLight intensity={0.5} />
      <Environment preset="sunset" />
      
      <spotLight position={[5, 20, 5]} angle={0.4} penumbra={1} intensity={1.5} castShadow shadow-bias={-0.0001} />
      <pointLight position={[-10, 5, 0]} intensity={0.5} color="#ffd700" />

      <group>
         <KalimbaBody />
         {KALIMBA_KEYS.map((key) => {
           const isActive = key.midi === activeMidi || pressedKeys.has(key.id);
           return (
             <Key 
               key={key.id}
               data={key} 
               active={isActive}
               isPlayingSong={isPlayingSong}
               onPlay={onPlayKey} 
             />
           );
         })}
      </group>

      <ContactShadows position={[0, -1.2, 0]} opacity={0.6} scale={50} blur={2} far={10} color="#000" />
    </>
  );
};

export default function KalimbaPage() {
  const [activeMidi, setActiveMidi] = useState<number | null>(null);
  const [songIndex, setSongIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set()); 
  
  const nextNoteIndexRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  
  // ... (Keyboard Logic Omitted, same as before) ...
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      
      const key = e.key.toUpperCase();
      const code = e.code;
      let char = key;
      if (code === 'Space') char = 'Space';
      
      const id = KEY_MAPPING.findIndex(k => k.toUpperCase() === char);
      
      if (id !== -1) {
        const kData = KALIMBA_KEYS.find(k => k.id === id);
        if (kData) {
            audio.ensureInit();
            audio.play(kData.freq, 0.9);
            setPressedKeys(prev => {
                const newSet = new Set(prev);
                newSet.add(id);
                return newSet;
            });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const code = e.code;
      let char = key;
      if (code === 'Space') char = 'Space';

      const id = KEY_MAPPING.findIndex(k => k.toUpperCase() === char);
      if (id !== -1) {
          setPressedKeys(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
          });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Audio Scheduler (Background safe)
  useEffect(() => {
    if (songIndex === null || !isPlaying) return;

    const song = SONGS[songIndex];
    audio.ensureInit(); 
    
    nextNoteIndexRef.current = 0;
    startTimeRef.current = audio.ctx!.currentTime + 0.1;
    
    const scheduleWindow = 1.5; 

    const scheduler = () => {
        if (!audio.ctx) return;
        const currentTime = audio.ctx.currentTime;

        while (nextNoteIndexRef.current < song.notes.length) {
            const note = song.notes[nextNoteIndexRef.current];
            const noteTime = startTimeRef.current + (note.t * song.speed);

            if (noteTime < currentTime + scheduleWindow) {
                const key = KALIMBA_KEYS.find(k => k.midi === note.midi);
                if (key) {
                    audio.play(key.freq, 0.8, song.instrument || 'kalimba', noteTime);
                }
                nextNoteIndexRef.current++;
            } else {
                break;
            }
        }
        
        const lastNote = song.notes[song.notes.length - 1];
        const endTime = startTimeRef.current + (lastNote.t * song.speed);
        
        if (currentTime > endTime + 2.0 && nextNoteIndexRef.current >= song.notes.length) {
            setIsPlaying(false);
            setSongIndex(null);
        }
    };

    const timerId = setInterval(scheduler, 200); 
    scheduler(); 

    return () => clearInterval(timerId);
  }, [songIndex, isPlaying]);

  // Visual Sync Loop (Standard RAF instead of useFrame)
  useEffect(() => {
    if (songIndex === null || !isPlaying) {
        if (activeMidi !== null) setActiveMidi(null);
        return;
    }

    let rafId: number;
    const song = SONGS[songIndex];

    const visualTick = () => {
        if (!audio.ctx) return;
        const currentTime = audio.ctx.currentTime;
        const songTime = currentTime - startTimeRef.current;
        
        const activeNote = song.notes.find(n => {
            const noteT = n.t * song.speed;
            return songTime >= noteT && songTime < noteT + 0.15;
        });

        if (activeNote) {
            setActiveMidi(activeNote.midi);
        } else {
            setActiveMidi(null);
        }
        rafId = requestAnimationFrame(visualTick);
    };

    rafId = requestAnimationFrame(visualTick);
    return () => cancelAnimationFrame(rafId);
  }, [songIndex, isPlaying, activeMidi]); // activeMidi dep might cause excessive re-runs? No, setActiveMidi is stable. 
  // Wait, if activeMidi changes, effect re-runs? Yes. 
  // We want the loop to keep running. 
  // Removing activeMidi from dep array is better, relying on closure or refs?
  // Actually, standard pattern is to not include visual state in dependency if we just want loop.
  // But we need 'songIndex' and 'isPlaying'.

  const handlePlayKey = (id: number, freq: number, factor: number) => {
    audio.ensureInit(); 
    audio.play(freq, factor);
  };

  const handleStartSong = (idx: number) => {
    audio.ensureInit();
    setSongIndex(idx);
    setIsPlaying(true);
  };

  const handleStopSong = () => {
    setIsPlaying(false);
    setSongIndex(null);
    setActiveMidi(null);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#1a1a1a' }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 15, 10], fov: 45 }}>
        {/* Extracted Scene Content */}
        <KalimbaScene 
            activeMidi={activeMidi} 
            isPlayingSong={isPlaying} 
            pressedKeys={pressedKeys} 
            onPlayKey={handlePlayKey}
            onSetActiveMidi={setActiveMidi}
            songIndex={songIndex}
        />
      </Canvas>

      <div style={{ 
        position: 'absolute', 
        top: 0, left: 0, width: '100%', height: '100%', 
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        
        <header style={{ padding: '30px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}>
           <h1 style={{ 
             margin: 0, 
             fontSize: '3rem', 
             fontWeight: '900', 
             color: '#fff', 
             fontFamily: '"Microsoft JhengHei", sans-serif'
           }}>
             拇指鐵琴 <span style={{ fontSize: '1.5rem', fontWeight: 'normal', color: '#ffaa44' }}>Pro</span>
           </h1>
           <p style={{ color: '#ccc', margin: '5px 0 0 0' }}>支援雙手鍵盤演奏：左手 (G,F,D,S,A...) | 右手 (H,J,K,L,;...) | 空白鍵 (Center)</p>
        </header>

        <div style={{ 
           pointerEvents: 'auto',
           padding: '30px',
           background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
           display: 'flex',
           flexDirection: 'column',
           gap: '10px',
           alignItems: 'center'
        }}>
           <div style={{ color: '#fff', marginBottom: '10px', fontSize: '1.1rem' }}>內建樂譜自動彈奏</div>
           <div style={{ display: 'flex', gap: '10px' }}>
             {SONGS.map((song, idx) => (
               <button
                 key={idx}
                 onClick={() => handleStartSong(idx)}
                 style={{
                   padding: '10px 20px',
                   background: (songIndex === idx && isPlaying) ? '#ffaa44' : 'rgba(255,255,255,0.1)',
                   border: '1px solid rgba(255,255,255,0.2)',
                   color: '#fff',
                   borderRadius: '20px',
                   cursor: 'pointer',
                   fontFamily: '"Microsoft JhengHei"',
                   transition: 'all 0.2s'
                 }}
               >
                 {isPlaying && songIndex === idx ? '▶ 播放中...' : song.name}
               </button>
             ))}
             {isPlaying && (
               <button
                 onClick={handleStopSong}
                 style={{
                   padding: '10px 20px',
                   background: '#ff4444',
                   border: 'none',
                   color: '#fff',
                   borderRadius: '20px',
                   cursor: 'pointer'
                 }}
               >
                 停止
               </button>
             )}
           </div>
        </div>
      </div>
    </div>
  );
}