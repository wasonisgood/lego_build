import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Float, Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

// --- 設定與型別 ---
type BrickData = {
  id: string;
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
  stage: number; // 層數/階段
  rotation?: [number, number, number];
};

const MATERIALS = {
  GLASS_GREEN: '#2E8B57',   // 101 經典綠玻璃
  GLASS_LIGHT: '#3CB371',   // 亮一點的綠
  CONCRETE: '#A9A9A9',      // 混凝土灰
  GOLD: '#FFD700',          // 裝飾金
  STEEL: '#708090',         // 鋼構
  NIGHT_LIGHT: '#FFFFE0'    // 夜間燈光
};

// --- 單個樂高積木組件 ---
const LegoBrick = ({ data, isAssembled, currentStage }: { data: BrickData, isAssembled: boolean, currentStage: number }) => {
  const meshRef = useRef<THREE.Group>(null);
  
  // 初始散落位置：上方天空
  const initialPos = useMemo(() => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 30;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      40 + Math.random() * 20,
      Math.sin(angle) * radius
    );
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const targetPos = new THREE.Vector3(...data.pos);
    
    // 邏輯：只有當目前總進度 (currentStage) >= 積木的 stage 時，積木才飛入
    // 加上一點隨機延遲讓同一層的積木不會完全同時到達
    const isTargetLayer = currentStage >= data.stage;
    
    let isActive = isAssembled && isTargetLayer;

    if (!isAssembled) isActive = false;

    if (isActive) {
      // 飛入動畫：Lerp
      meshRef.current.position.lerp(targetPos, 0.08); // 速度稍慢，更有「建造」感
      
      if (data.rotation) {
        const targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation));
        meshRef.current.quaternion.slerp(targetQ, 0.08);
      } else {
        meshRef.current.quaternion.slerp(new THREE.Quaternion(0,0,0,1), 0.08);
      }
    } else {
      // 飛回天空
      meshRef.current.position.lerp(initialPos, 0.05);
      meshRef.current.rotation.x += delta * 0.5;
      meshRef.current.rotation.z += delta * 0.2;
    }
  });

  const showStuds = data.size[0] > 0.3 && data.size[2] > 0.3;

  return (
    <group ref={meshRef} position={initialPos}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={data.size} />
        <meshStandardMaterial 
          color={data.color} 
          roughness={0.1} 
          metalness={data.color === MATERIALS.GOLD ? 0.8 : 0.3} 
          transparent={data.color === MATERIALS.GLASS_GREEN}
          opacity={data.color === MATERIALS.GLASS_GREEN ? 0.9 : 1}
        />
      </mesh>
      {showStuds && (
        <mesh position={[0, data.size[1]/2 + 0.05, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.1, 8]} />
          <meshStandardMaterial color={data.color} />
        </mesh>
      )}
    </group>
  );
};

// --- 生成台北101積木數據 ---
const generateTaipei101 = () => {
  const bricks: BrickData[] = [];
  let idCounter = 0;
  
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, stage: number) => {
    bricks.push({
      id: `t101_${idCounter++}`,
      pos: [x, y, z],
      size: [w, h, d],
      color,
      stage
    });
  };

  const S = 0.5; // 基礎單位
  let currentY = 0;
  let stage = 0;

  // 1. 基座 (Shopping Mall Base) - 梯形感，分三層縮進
  // Base Layer 1
  for(let x = -4; x <= 4; x+=2) {
    for(let z = -4; z <= 4; z+=2) {
      add(x*S, currentY, z*S, S*1.8, S, S*1.8, MATERIALS.CONCRETE, stage);
    }
  }
  currentY += S; stage++;
  
  // Base Layer 2
  for(let x = -3; x <= 3; x+=2) {
    for(let z = -3; z <= 3; z+=2) {
      add(x*S, currentY, z*S, S*1.8, S, S*1.8, MATERIALS.CONCRETE, stage);
    }
  }
  currentY += S; stage++;

  // Base Layer 3 (Transition)
  add(0, currentY, 0, S*5, S, S*5, MATERIALS.GLASS_GREEN, stage);
  currentY += S; stage++;

  // 2. 主塔身 (8個倒梯形斗狀結構)
  // 每個斗狀結構由 2-3 層組成，從下往上變大
  for (let segment = 0; segment < 8; segment++) {
    // 斗狀底部 (較窄)
    add(0, currentY, 0, S*4, S, S*4, MATERIALS.GLASS_GREEN, stage);
    // 角落裝飾 (如意紋飾位置)
    add(S*2.2, currentY, S*2.2, S, S, S, MATERIALS.GOLD, stage);
    add(-S*2.2, currentY, S*2.2, S, S, S, MATERIALS.GOLD, stage);
    add(S*2.2, currentY, -S*2.2, S, S, S, MATERIALS.GOLD, stage);
    add(-S*2.2, currentY, -S*2.2, S, S, S, MATERIALS.GOLD, stage);
    currentY += S; 
    
    // 斗狀中部
    add(0, currentY, 0, S*4.5, S, S*4.5, MATERIALS.GLASS_GREEN, stage);
    currentY += S;

    // 斗狀頂部 (最寬)
    add(0, currentY, 0, S*5.2, S, S*5.2, MATERIALS.GLASS_LIGHT, stage);
    currentY += S;
    
    // 下一個結構的間隔
    stage++;
  }

  // 3. 塔頂 (Top)
  // 收縮層
  add(0, currentY, 0, S*3, S, S*3, MATERIALS.CONCRETE, stage);
  currentY += S; stage++;
  
  add(0, currentY, 0, S*2, S*2, S*2, MATERIALS.GLASS_GREEN, stage);
  currentY += S*2; stage++;

  // 4. 尖塔 (Spire)
  add(0, currentY + S*2, 0, S*0.5, S*6, S*0.5, MATERIALS.STEEL, stage);
  
  return bricks;
};

// --- 煙火粒子效果 ---
const Fireworks = ({ active }: { active: boolean }) => {
  if (!active) return null;
  return (
    <group position={[0, 15, 0]}>
       {/* 金色大煙火 */}
       <Sparkles count={200} scale={[20, 20, 20]} size={15} speed={0.5} opacity={1} color="#FFD700" noise={1} />
       {/* 紅色點綴 */}
       <Sparkles count={100} scale={[15, 25, 15]} size={20} speed={0.8} opacity={0.8} color="#FF4500" noise={0.5} />
       {/* 閃爍星光 */}
       <Sparkles count={300} scale={[30, 40, 30]} size={5} speed={0.2} opacity={0.5} color="#FFFFFF" />
    </group>
  );
};

const Taipei101Model = ({ assemble, setCompleted, onProgress }: { 
  assemble: boolean, 
  setCompleted: (v: boolean) => void,
  onProgress: (p: number) => void 
}) => {
  const bricks = useMemo(() => generateTaipei101(), []);
  const [currentStage, setCurrentStage] = useState(0);
  const maxStage = useMemo(() => Math.max(...bricks.map(b => b.stage)), [bricks]);
  
  // 使用 ref 來避免重複觸發 setCompleted
  const isCompletedRef = useRef(false);

  // 控制組裝進度
  useFrame((state, delta) => {
    if (assemble) {
      // 加快建造速度: 每秒約 2.5 層
      setCurrentStage(prev => {
        const next = prev + delta * 2.5;
        
        // 計算進度百分比 (0~100)
        const progress = Math.min((next / maxStage) * 100, 100);
        onProgress(Math.floor(progress));

        if (next > maxStage + 1) {
            if (!isCompletedRef.current) {
              setCompleted(true);
              isCompletedRef.current = true;
            }
            return maxStage + 1.5; 
        }
        return next;
      });
    } else {
      setCurrentStage(prev => {
        const next = Math.max(prev - delta * 8, -1);
        if (next <= 0) {
           onProgress(0);
        }
        return next;
      });
      if (isCompletedRef.current) {
        setCompleted(false);
        isCompletedRef.current = false;
      }
    }
  });

  return (
    <group position={[0, -10, 0]}>
      {bricks.map((brick) => (
        <LegoBrick 
          key={brick.id} 
          data={brick} 
          isAssembled={assemble}
          currentStage={Math.floor(currentStage)}
        />
      ))}
    </group>
  );
};

export default function Taipei101Page() {
  const [assemble, setAssemble] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [progress, setProgress] = useState(0);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000011' }}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: [20, 20, 20], fov: 45 }}>
        <PerspectiveCamera makeDefault position={[30, 15, 30]} fov={40} />
        <OrbitControls 
            makeDefault 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 2} 
            maxDistance={80} 
            minDistance={10} 
            autoRotate={completed} 
            autoRotateSpeed={1.0} // 加快旋轉速度
        />
        
        <ambientLight intensity={0.2} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <Environment preset="night" />
        
        <spotLight position={[30, 50, 30]} angle={0.3} penumbra={1} intensity={1} castShadow />
        <pointLight position={[-20, 10, -20]} intensity={0.5} color="#00ff00" />
        
        <Taipei101Model 
          assemble={assemble} 
          setCompleted={setCompleted} 
          onProgress={setProgress}
        />
        
        {/* 完成時的煙火 */}
        <Fireworks active={completed} />

        <ContactShadows position={[0, -10, 0]} opacity={0.5} scale={50} blur={2} far={10} />
        <gridHelper args={[100, 50, '#333333', '#111111']} position={[0, -10.1, 0]} />
      </Canvas>

      {/* UI */}
      <div style={{ 
        position: 'absolute', 
        top: 0, left: 0, width: '100%', height: '100%', 
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        
        <header style={{ padding: '40px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}>
           <h1 style={{ 
             margin: 0, 
             fontSize: '3.5rem', 
             fontWeight: '900', 
             color: '#fff', 
             letterSpacing: '0.1em',
             fontFamily: '"Microsoft JhengHei", sans-serif'
           }}>
             台北<span style={{ color: '#2E8B57' }}>101</span>
           </h1>
           <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
             <p style={{ color: '#aaa', margin: 0, fontSize: '1.2rem', fontFamily: '"Microsoft JhengHei", sans-serif' }}>
               世界地標・層層堆疊模擬
             </p>
             {assemble && !completed && (
               <span style={{ color: '#FFD700', fontSize: '1.2rem', fontWeight: 'bold' }}>
                 建造進度: {progress}%
               </span>
             )}
             {completed && (
               <motion.span 
                 initial={{ opacity: 0, scale: 0.5 }}
                 animate={{ opacity: 1, scale: 1 }}
                 style={{ color: '#FFD700', fontSize: '1.2rem', fontWeight: 'bold', textShadow: '0 0 10px gold' }}
               >
                 ✨ 建造完成 ✨
               </motion.span>
             )}
           </div>
        </header>

        <div style={{ 
          padding: '50px', 
          textAlign: 'center', 
          pointerEvents: 'auto'
        }}>
          <button 
            onClick={() => setAssemble(!assemble)}
            style={{
              padding: '15px 60px',
              fontSize: '1.5rem',
              fontFamily: '"Microsoft JhengHei", sans-serif',
              fontWeight: 'bold',
              color: assemble ? '#fff' : '#000',
              backgroundColor: assemble ? '#444' : '#2E8B57',
              border: 'none',
              borderRadius: '2px', 
              cursor: 'pointer',
              boxShadow: assemble ? 'none' : '0 0 30px rgba(46, 139, 87, 0.4)',
              transition: 'all 0.3s'
            }}
          >
            {assemble ? '重新建造' : '開始建造'}
          </button>
        </div>
      </div>
    </div>
  );
}
