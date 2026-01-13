import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Float, useTexture, Text } from '@react-three/drei';
import * as THREE from 'three';

// --- 小提琴音頻引擎 (Physical Modeling Synthesis) ---
class ViolinAudio {
  ctx: AudioContext | null = null;
  masterGain: GainNode | null = null;
  strings: { [key: string]: ViolinString } = {};
  reverb: ConvolverNode | null = null;

  constructor() {
    // Lazy init
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;

    // Body Impulse Response (Resonance)
    // 模擬提琴木頭琴身的共鳴
    this.reverb = this.ctx.createConvolver();
    this.createBodyResonance();
    
    this.masterGain.connect(this.reverb);
    this.reverb.connect(this.ctx.destination);
    
    // 初始化四根弦 (G3, D4, A4, E5)
    this.strings['G'] = new ViolinString(this.ctx, this.masterGain, 196.00);
    this.strings['D'] = new ViolinString(this.ctx, this.masterGain, 293.66);
    this.strings['A'] = new ViolinString(this.ctx, this.masterGain, 440.00);
    this.strings['E'] = new ViolinString(this.ctx, this.masterGain, 659.25);
  }

  createBodyResonance() {
    if (!this.ctx || !this.reverb) return;
    const rate = this.ctx.sampleRate;
    const length = rate * 0.5; // 短而密的木頭共鳴
    const impulse = this.ctx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 4);
        left[i] = (Math.random() * 2 - 1) * decay * 0.5;
        right[i] = (Math.random() * 2 - 1) * decay * 0.5;
    }
    this.reverb.buffer = impulse;
  }

  // 模擬拉弓
  // stringName: 'G', 'D', 'A', 'E'
  // velocity: 弓的速度 (0 ~ 1) - 影響音量與音色亮度
  // fingerPos: 按弦位置 (0 ~ 1), 0是空弦, 數值越大音越高
  bow(stringName: string, velocity: number, fingerPos: number) {
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    // 停止其他弦 (簡單化：單音演奏，真實小提琴可雙音，但模擬較難控制)
    Object.keys(this.strings).forEach(k => {
      if (k !== stringName) this.strings[k].stop();
    });

    this.strings[stringName].play(velocity, fingerPos);
  }

  stopAll() {
    Object.values(this.strings).forEach(s => s.stop());
  }
}

class ViolinString {
  ctx: AudioContext;
  output: AudioNode;
  baseFreq: number;
  
  osc: OscillatorNode | null = null;
  noise: AudioBufferSourceNode | null = null;
  gain: GainNode | null = null;
  filter: BiquadFilterNode | null = null; // 模擬琴身共振峰 (Formant)
  
  constructor(ctx: AudioContext, output: AudioNode, baseFreq: number) {
    this.ctx = ctx;
    this.output = output;
    this.baseFreq = baseFreq;
  }

  play(velocity: number, fingerPos: number) {
    const t = this.ctx.currentTime;
    
    // 計算音高：按弦縮短弦長 -> 頻率上升
    // 假設指板長度可涵蓋約一個八度以上
    // freq = base * 2^(semitones/12)
    // 簡單線性映射 fingerPos (0-1) 到 0-12 半音 (實際上是指數關係)
    // 物理上：Freq_new = Freq_old / (1 - fingerPos * 0.5) roughly
    const targetFreq = this.baseFreq * Math.pow(2, (fingerPos * 12) / 12); 

    // 如果已經在播放，更新參數 (Legato)
    if (this.osc && this.gain && this.filter) {
      this.osc.frequency.setTargetAtTime(targetFreq, t, 0.05);
      
      // 弓速決定音量與濾波器開合
      const targetVol = Math.min(1, velocity * 1.5);
      this.gain.gain.setTargetAtTime(targetVol, t, 0.02);
      
      // 弓速越快，高頻越多 (Sawtooth 越亮)
      const cutoff = 800 + velocity * 4000; 
      this.filter.frequency.setTargetAtTime(cutoff, t, 0.02);
      
      return;
    }

    // 新的運弓
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sawtooth'; // 鋸齒波最接近弦樂基音
    this.osc.frequency.value = targetFreq;

    // 摩擦噪音 (Bow Noise) - 模擬松香摩擦的粗糙感
    // 這部分省略詳細實作，以 Filter 的 Q 值和 Sawtooth 模擬為主

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2; // 稍微有些共振
    this.filter.frequency.value = 1000;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.osc.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.output);

    this.osc.start(t);
    
    // Attack
    this.gain.gain.setTargetAtTime(velocity, t, 0.05);
  }

  stop() {
    if (this.gain) {
      const t = this.ctx.currentTime;
      this.gain.gain.setTargetAtTime(0, t, 0.1); // Release
      
      // 稍後清理
      const oldOsc = this.osc;
      const oldGain = this.gain;
      setTimeout(() => {
        if (oldOsc) oldOsc.stop();
        if (oldGain) oldGain.disconnect();
      }, 200);
      
      this.osc = null;
      this.gain = null;
      this.filter = null;
    }
  }
}

const violinAudio = new ViolinAudio();

// --- 3D 模型組件 ---

// 琴身形狀生成
const ViolinBodyGeometry = () => {
  const shape = new THREE.Shape();
  // 使用貝茲曲線繪製經典的提琴漏斗狀 (Hourglass)
  // 右半邊
  shape.moveTo(0, -4);
  shape.bezierCurveTo(2.5, -4, 3, -2, 2, -1); // 下半寬部
  shape.bezierCurveTo(1.5, -0.5, 1.5, 0.5, 2, 1); // 腰身 (C-bout)
  shape.bezierCurveTo(3, 2, 2.5, 4, 0, 4); // 上半寬部
  // 左半邊 (鏡像)
  shape.bezierCurveTo(-2.5, 4, -3, 2, -2, 1); 
  shape.bezierCurveTo(-1.5, 0.5, -1.5, -0.5, -2, -1);
  shape.bezierCurveTo(-3, -2, -2.5, -4, 0, -4);

  const extrudeSettings = {
    steps: 2,
    depth: 1, // 厚度
    bevelEnabled: true,
    bevelThickness: 0.2,
    bevelSize: 0.2,
    bevelSegments: 3
  };

  return <extrudeGeometry args={[shape, extrudeSettings]} />;
};

// 琴弦
const Strings = ({ activeString, vibration }: { activeString: string | null, vibration: number }) => {
  const strings = ['G', 'D', 'A', 'E'];
  // X positions: -0.45, -0.15, 0.15, 0.45
  
  return (
    <group position={[0, 0, 1.2]}>
      {strings.map((s, i) => {
        const x = -0.45 + i * 0.3;
        const isActive = s === activeString;
        return (
          <mesh key={s} position={[x, 0, 0]}>
            {/* 弦是一條細長的圓柱 */}
            <cylinderGeometry args={[0.02, 0.02, 14, 8]} />
            <meshStandardMaterial 
              color={i === 3 ? "#C0C0C0" : "#808080"} // E弦通常是銀色
              metalness={0.8} 
              roughness={0.2} 
            />
            {/* 振動視覺效果 */}
            {isActive && vibration > 0.01 && (
               <mesh position={[0, 0, 0]} scale={[1 + vibration * 10, 1, 1]}>
                 <cylinderGeometry args={[0.04, 0.04, 14, 8]} />
                 <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
               </mesh>
            )}
          </mesh>
        );
      })}
    </group>
  );
};

// 琴弓
const Bow = ({ position, speed, onString }: { position: THREE.Vector3, speed: number, onString: boolean }) => {
  // 琴弓跟隨滑鼠位置，並根據速度產生傾斜效果
  return (
    <group position={position} rotation={[0, 0, speed * 2]}> 
      {/* 弓桿 */}
      <mesh position={[0, 0, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 12, 8]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      {/* 弓毛 */}
      <mesh position={[0, -0.1, 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[0.02, 11.5, 0.2]} />
        <meshStandardMaterial color="#fffff0" />
      </mesh>
      
      {/* 接觸點的松香煙霧效果 (簡化版) */}
      {onString && speed > 0.1 && (
        <mesh position={[0, 0, 0]}>
           <sphereGeometry args={[0.2, 8, 8]} />
           <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
        </mesh>
      )}
    </group>
  );
};

// 主要場景
const ViolinModel = ({ 
  bowPos, 
  bowSpeed, 
  activeString,
  fingerPos
}: { 
  bowPos: THREE.Vector3, 
  bowSpeed: number, 
  activeString: string | null,
  fingerPos: number
}) => {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
      {/* 琴身 */}
      <mesh position={[0, 0, 0]}>
        <ViolinBodyGeometry />
        <meshStandardMaterial color="#5c3a21" roughness={0.1} metalness={0.1} />
      </mesh>
      
      {/* 琴頸 (Neck) & 指板 (Fingerboard) */}
      <group position={[0, 4, 0.5]}>
         {/* Neck */}
         <mesh position={[0, 2, 0]}>
           <boxGeometry args={[1, 4, 0.8]} />
           <meshStandardMaterial color="#5c3a21" />
         </mesh>
         {/* Fingerboard (Black) */}
         <mesh position={[0, 1, 0.5]}>
           <boxGeometry args={[1.2, 8, 0.2]} />
           <meshStandardMaterial color="#111111" roughness={0.2} />
         </mesh>
      </group>

      {/* 琴碼 (Bridge) */}
      <mesh position={[0, -1, 1.1]} rotation={[Math.PI/2, 0, 0]}>
         <extrudeGeometry args={[new THREE.Shape().moveTo(-1,0).lineTo(-0.8, 1).lineTo(0.8, 1).lineTo(1, 0), { depth: 0.1, bevelEnabled: false }]} />
         <meshStandardMaterial color="#d2b48c" />
      </mesh>

      {/* 腮托 (Chinrest) */}
      <mesh position={[-1.5, -3.5, 1]} rotation={[0, 0, 0.5]}>
         <cylinderGeometry args={[1, 1, 0.3, 32]} />
         <meshStandardMaterial color="#111" />
      </mesh>

      {/* 弦 */}
      <Strings activeString={activeString} vibration={bowSpeed} />

      {/* 按指指示 (Visual feedback for fingering) */}
      {fingerPos > 0 && (
         <mesh position={[0, 3 + fingerPos * 4, 1.3]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshBasicMaterial color="#00ff00" />
         </mesh>
      )}

      {/* 琴弓 (獨立於琴身 Group，但視覺上要互動) */}
      {/* 為了簡化座標變換，這裡把 Bow 放進來，實際上 Bow 應該跟隨 World Mouse */}
    </group>
  );
};

export default function ViolinPage() {
  // 狀態
  const [bowPosition, setBowPosition] = useState(new THREE.Vector3(0, 0, 2));
  const [bowVelocity, setBowVelocity] = useState(0);
  const [activeString, setActiveString] = useState<string | null>(null);
  const [fingerPos, setFingerPos] = useState(0); // 0 (Open) to 1 (High)
  
  // Refs 用於計算速度
  const lastMousePos = useRef({ x: 0, y: 0 });
  const playAreaRef = useRef<HTMLDivElement>(null);

  // 處理滑鼠移動 (運弓 + 換弦)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!playAreaRef.current) return;
    
    const rect = playAreaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; // 0 ~ width
    const y = e.clientY - rect.top;  // 0 ~ height
    
    // Normalize logic
    // X軸: 運弓 (Bow action)
    // Y軸: 選擇弦 (String selection)
    
    // 計算速度 (X軸變化)
    const deltaX = Math.abs(x - lastMousePos.current.x);
    const speed = Math.min(deltaX / 10, 1.0); // Sensitivity
    
    // 更新 Audio
    // 判斷在哪根弦: Y 軸 0~100% 分成四區
    const height = rect.height;
    const stringZone = y / height; // 0.0 (Top/G) ~ 1.0 (Bottom/E)
    
    let currentString = '';
    // G(Low) is usually left, E(High) is right on violin, 
    // but on screen visuals: G is Left (-x), E is Right (+x).
    // Bow moves Perpendicular to strings.
    // Let's map Y axis to String Selection for ease of use.
    // Top -> G, Down -> E.
    if (stringZone < 0.25) currentString = 'G';
    else if (stringZone < 0.5) currentString = 'D';
    else if (stringZone < 0.75) currentString = 'A';
    else currentString = 'E';

    // 只有當速度夠快才發聲
    if (speed > 0.05) {
      violinAudio.bow(currentString, speed, fingerPos);
      setActiveString(currentString);
    } else {
      // 速度過慢，停止摩擦
      // violinAudio.stopAll(); // 為了 Legato 效果，我們可以讓它自然衰減，或者設 gain = 0
       // 這裡暫時不做完全 stop，靠 audio engine 的 velocity 更新 logic
       violinAudio.bow(currentString, 0, fingerPos); 
    }
    
    setBowVelocity(speed);
    setActiveString(currentString); // 即使不拉也顯示選中

    // 更新 3D 弓的位置
    // Mapping 2D mouse to 3D world roughly
    // X (Mouse) -> X (World, movement along bow)
    // Y (Mouse) -> X (World, across strings) -> Wait, Strings are laid out on X axis in 3D model?
    // Let's check ViolinModel.
    // Body is upright? rotation={[-Math.PI / 2, 0, 0]}. Z becomes Y up.
    // Strings are at x: -0.45, -0.15...
    // So String selection should map to 3D X position.
    // Bow stroke should map to 3D Y position (across the string length? No, bow moves perpendicular to string).
    
    // Correct Violin Physics:
    // Strings run along Y axis (Neck to Tail).
    // Bow moves along X axis (Left/Right).
    
    // My controls:
    // Mouse X -> Bow Stroke (Movement).
    // Mouse Y -> String Select.
    
    // 3D Bow Visual Position:
    // 3D X: Depends on Active String (Mouse Y)
    // 3D Y: Depends on Bow Stroke (Mouse X) (Moving along the string?? No, crossing it)
    // Actually, Bow is a stick. 
    // It should be placed *on* the string.
    // The "Stroke" moves the bow *lengthwise*.
    
    // Let's simplified visual mapping:
    // Bow 3D X = Mapped from String (G=-0.45 ... E=0.45)
    // Bow 3D Y = Mapped from Mouse X (The stroke position relative to bridge) - actually Y is up/down neck.
    // Usually bow stays near bridge.
    // The movement is the bow sliding.
    
    // Let's just animate the bow sliding left/right
    const stringX = {
        'G': -0.45, 'D': -0.15, 'A': 0.15, 'E': 0.45
    }[currentString] || 0;
    
    // Mouse X (0~width) maps to Bow sliding offset
    const bowSlide = (x / rect.width - 0.5) * 6; // -3 ~ +3
    
    setBowPosition(new THREE.Vector3(stringX, -1, 2)); // Fixed Y near bridge (-1), Z above strings
    // We will apply 'bowSlide' as an offset or rotation in the Bow component
    
    // Hack: pass slide info via velocity or separate state? 
    // Let's just use bowPosition to store the center point, and animate rotation/slide in component
    // Actually, Bow component logic:
    // position is the contact point.
    // visual mesh should slide relative to this contact point.
    
    // Store slide in a ref or global var to keep component simple?
    // Let's just update a "bowOffset" state if we want strict visual sync.
    // For now, simplify: Bow moves left/right based on Mouse X.
    setBowPosition(new THREE.Vector3(stringX + (Math.random()*0.02), -1 + (Math.random()*0.02), 1.5)); // Add jitter

    lastMousePos.current = { x, y };
  };

  const handleKeyDown = (e: KeyboardEvent) => {
     // 模擬把位/指法
     // 1, 2, 3, 4 對應四隻手指，音高越高
     const keyMap: {[key: string]: number} = {
         '1': 0.1, // Index finger
         '2': 0.25, // Middle
         '3': 0.4, // Ring
         '4': 0.55, // Pinky
         'Space': 0 // Release
     };
     if (keyMap[e.key] !== undefined) {
         setFingerPos(keyMap[e.key]);
     }
  };
  
  const handleKeyUp = (e: KeyboardEvent) => {
      // Release to 0 (Open string)
      // Only if the released key matches current pos? 
      // Simplify: reset to 0
      setFingerPos(0);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div 
        ref={playAreaRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
            violinAudio.stopAll();
            setBowVelocity(0);
            setActiveString(null);
        }}
        style={{ width: '100%', height: '100%', position: 'relative', background: '#2d1b0e', cursor: 'none' }}
    >
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 5, 8], fov: 45 }}>
        <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={50} />
        <OrbitControls 
            makeDefault 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 1.5} 
            maxDistance={20} 
            minDistance={5} 
            enablePan={false}
            enableRotate={false} // 鎖定旋轉，讓滑鼠專注於演奏
        />
        
        <ambientLight intensity={0.4} />
        <Environment preset="studio" />
        <spotLight position={[5, 10, 5]} angle={0.3} penumbra={1} intensity={1} castShadow />

        <ViolinModel 
           bowPos={bowPosition} 
           bowSpeed={bowVelocity} 
           activeString={activeString} 
           fingerPos={fingerPos}
        />
        
        {/* Render Bow separately to follow mouse logic tightly if needed, 
            but putting it in Model is fine for now. 
            We need to visualize the Bow moving across strings. */}
        <Bow position={bowPosition} speed={bowVelocity} onString={!!activeString} />

        <ContactShadows position={[0, -2.5, 0]} opacity={0.5} scale={20} blur={2} far={10} color="#000" />
      </Canvas>

      {/* UI Overlay */}
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
             color: '#d2b48c', 
             fontFamily: '"Microsoft JhengHei", serif',
             textShadow: '0 2px 10px rgba(0,0,0,0.5)'
           }}>
             Solo <span style={{ fontStyle: 'italic', color: '#fff' }}>Violin</span>
           </h1>
           <div style={{ marginTop: '10px', color: '#ccc', fontFamily: 'sans-serif', lineHeight: '1.5' }}>
             <p><strong>滑鼠 X 軸:</strong> 運弓速度 (音量/力度)</p>
             <p><strong>滑鼠 Y 軸:</strong> 選擇琴弦 (上 G - D - A - E 下)</p>
             <p><strong>鍵盤 1-4:</strong> 左手按弦 (音高)</p>
           </div>
        </header>

        {/* 視覺化力度條 */}
        <div style={{ 
            position: 'absolute', 
            bottom: '50px', 
            left: '50%', 
            transform: 'translateX(-50%)',
            width: '300px', 
            height: '10px', 
            background: '#444', 
            borderRadius: '5px',
            overflow: 'hidden'
        }}>
            <div style={{ 
                width: `${Math.min(bowVelocity * 100, 100)}%`, 
                height: '100%', 
                background: `linear-gradient(90deg, #d2b48c, #ff4500)`,
                transition: 'width 0.1s ease-out'
            }} />
        </div>
      </div>
    </div>
  );
}
