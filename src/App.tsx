import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows, Float, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';

// --- 設定與型別 ---
type BrickData = {
  id: string;
  pos: [number, number, number]; // 實際世界座標
  size: [number, number, number]; // 積木尺寸 (寬, 高, 深)
  color: string;
  stage: number; // 組裝階段: 0:機身底座, 1:核心電路, 2:外殼, 3:機臂, 4:鏡頭雲台, 5:螺旋槳
  rotation?: [number, number, number];
};

// 樂高材質設定
const MATERIALS = {
  BODY_WHITE: '#F0F0F0',    // 機身亮灰白
  BODY_GREY: '#A0A0A0',     // 機身結構灰
  DARK_MECH: '#2D2D2D',     // 深色機械件
  BLACK_PROP: '#151515',    // 螺旋槳黑
  ORANGE_ACCENT: '#FF6600', // 翼尖橙色
  LENS_GLASS: '#050505',    // 鏡頭黑
  SENSOR_BLACK: '#111111',  // 感測器
  LED_GREEN: '#00FF00',     // 狀態燈
  LED_RED: '#FF0000'        // 尾燈
};

// --- 單個樂高積木組件 ---
const LegoBrick = ({ data, isAssembled, progress }: { data: BrickData, isAssembled: boolean, progress: number }) => {
  const meshRef = useRef<THREE.Group>(null);
  
  // 隨機生成初始散落位置 (在天空上方)
  const initialPos = useMemo(() => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 10 + Math.random() * 20;
    return new THREE.Vector3(
      Math.cos(angle) * radius,
      15 + Math.random() * 15,
      Math.sin(angle) * radius
    );
  }, []);

  // 每個積木的觸發閾值 (0.0 ~ 1.0)
  // 根據階段和一些隨機性來決定何時開始飛入
  const threshold = useMemo(() => {
    // 總階段數 6，每階段佔約 0.15 的進度，稍微重疊
    const stageBase = data.stage * 0.15; 
    const randomOffset = Math.random() * 0.1;
    return stageBase + randomOffset;
  }, [data.stage]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // 計算目標位置
    const targetPos = new THREE.Vector3(...data.pos);
    
    // 判斷是否應該開始組裝
    // 當總體進度 (progress) 超過此積木的閾值 (threshold) 時，開始移動
    let isActive = isAssembled && progress > threshold;
    
    // 如果是「拆解」狀態，我們希望它們反向飛走
    // 這裡簡化邏輯：只要 isAssembled 為 false，就視為回到初始點
    if (!isAssembled) isActive = false;

    if (isActive) {
      // 飛向組裝位置 (Lerp)
      // 速度隨距離變快，最後變慢
      meshRef.current.position.lerp(targetPos, 0.1);
      
      // 旋轉歸零
      if (data.rotation) {
        const targetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation));
        meshRef.current.quaternion.slerp(targetQ, 0.1);
      } else {
        meshRef.current.quaternion.slerp(new THREE.Quaternion(0,0,0,1), 0.1);
      }
    } else {
      // 飛回初始散落位置
      meshRef.current.position.lerp(initialPos, 0.05);
      // 閒置時隨機旋轉
      meshRef.current.rotation.x += delta * 0.5;
      meshRef.current.rotation.z += delta * 0.2;
    }
  });

  // 幾何體優化：根據尺寸選擇
  // 這裡為了效能與外觀，統一使用 BoxGeometry 但動態調整 args
  // 頂部的 Stud (突起)
  const showStuds = data.size[1] >= 0.2; // 太薄的平板可能不需要側邊細節，但樂高通常頂部都有
  
  return (
    <group ref={meshRef} position={initialPos}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={data.size} />
        <meshStandardMaterial 
          color={data.color} 
          roughness={0.2} 
          metalness={data.color === MATERIALS.LENS_GLASS ? 0.8 : 0.1} 
        />
      </mesh>
      {/* 模擬樂高頂部凸起 (Studs) */}
      {/* 為了效能，只在積木中心畫一個代表性的 Stud，或是如果積木較大則畫多個 (這裡簡化為中心一個) */}
      {showStuds && (
        <mesh position={[0, data.size[1]/2 + 0.05, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.1, 8]} />
          <meshStandardMaterial color={data.color} roughness={0.2} />
        </mesh>
      )}
    </group>
  );
};

// --- 生成高解析度無人機模型 ---
const generateComplexDrone = () => {
  const bricks: BrickData[] = [];
  let idCounter = 0;
  
  // 輔助函數：添加積木
  // pos: 中心座標, size: 尺寸 (W, H, D)
  const add = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, stage: number, rot?: [number, number, number]) => {
    bricks.push({
      id: `b_${idCounter++}`,
      pos: [x, y, z],
      size: [w, h, d],
      color,
      stage,
      rotation: rot
    });
  };

  // 單位轉換: 1 unit = 1 standard block size roughly
  // 使用較小的單位來構建細節 (scale 0.2)
  const S = 0.25; // 基礎網格大小

  // --- 階段 0: 機身底盤 (Chassis) ---
  // 底部主板 (長條型)
  for (let z = -4; z <= 4; z++) {
    for (let x = -1; x <= 1; x++) {
      add(x*S*2, 0, z*S*2, S*2, S, S*2, MATERIALS.BODY_GREY, 0);
    }
  }
  // 下腹部感測器區
  add(0, -S, 0, S*4, S/2, S*4, MATERIALS.DARK_MECH, 0);
  add(0, -S*1.5, 0, S*2, S/2, S*2, MATERIALS.SENSOR_BLACK, 0);

  // --- 階段 1: 核心結構與電池艙 (Core & Battery) ---
  // 機身加高
  for (let z = -3; z <= 3; z++) {
     add(0.5*S*2, S, z*S*2, S*2, S, S*2, MATERIALS.BODY_WHITE, 1);
     add(-0.5*S*2, S, z*S*2, S*2, S, S*2, MATERIALS.BODY_WHITE, 1);
  }
  // 電池艙隆起 (後方)
  for (let z = 1; z <= 3; z++) {
    add(0, S*2, z*S*2, S*3.8, S, S*2, MATERIALS.BODY_GREY, 1);
  }
  // 尾部散熱孔細節
  add(0, S*2, 4*S*2, S*3, S, S/2, MATERIALS.DARK_MECH, 1);

  // --- 階段 2: 外殼修飾 (Shell) ---
  // 機頭圓潤化 (前緣)
  add(0, S, -4*S*2 - S, S*3, S, S*2, MATERIALS.BODY_WHITE, 2);
  // 機背流線型
  add(0, S*2.5, 0, S*3.5, S/2, S*6, MATERIALS.BODY_WHITE, 2);
  // 側邊裝飾線條
  add(1.2*S*2, S*0.5, 0, S/2, S, S*8, MATERIALS.DARK_MECH, 2);
  add(-1.2*S*2, S*0.5, 0, S/2, S, S*8, MATERIALS.DARK_MECH, 2);

  // --- 階段 3: 機臂 (Arms) ---
  // 前機臂 (向外展開)
  const armLen = 6;
  const armThick = S;
  // 左前
  for(let i=1; i<=armLen; i++) {
    add((-2*S) - (i*S), S, (-3*S) - (i*S*0.5), S*2, armThick, S*2, MATERIALS.BODY_GREY, 3);
  }
  // 右前
  for(let i=1; i<=armLen; i++) {
    add((2*S) + (i*S), S, (-3*S) - (i*S*0.5), S*2, armThick, S*2, MATERIALS.BODY_GREY, 3);
  }
  // 左後 (較低)
  for(let i=1; i<=armLen; i++) {
    add((-2*S) - (i*S), 0, (3*S) + (i*S*0.5), S*2, armThick, S*2, MATERIALS.BODY_GREY, 3);
  }
  // 右後 (較低)
  for(let i=1; i<=armLen; i++) {
    add((2*S) + (i*S), 0, (3*S) + (i*S*0.5), S*2, armThick, S*2, MATERIALS.BODY_GREY, 3);
  }
  // 機臂腳墊
  add((-2*S) - (armLen*S), -S, (-3*S) - (armLen*S*0.5), S, S, S, MATERIALS.DARK_MECH, 3);
  add((2*S) + (armLen*S), -S, (-3*S) - (armLen*S*0.5), S, S, S, MATERIALS.DARK_MECH, 3);

  // --- 階段 4: 鏡頭雲台 (Gimbal) ---
  // 懸掛支架
  add(0, -S, -4.5*S*2, S*2, S, S*2, MATERIALS.DARK_MECH, 4);
  // 鏡頭主體 (黑色方塊)
  add(0, -S*2, -4.5*S*2, S*2.5, S*2, S*2.5, MATERIALS.LENS_GLASS, 4);
  // 鏡頭圈 (灰色環)
  add(0, -S*2, -4.5*S*2 - S*1.5, S*1.5, S*1.5, S/2, MATERIALS.BODY_GREY, 4);
  // 鏡頭玻璃
  add(0, -S*2, -4.5*S*2 - S*1.8, S, S, S/4, '#000033', 4);

  // --- 階段 5: 螺旋槳與馬達 (Props) ---
  const motorPositions = [
    { x: (-2*S) - (armLen*S), z: (-3*S) - (armLen*S*0.5), y: S + armThick }, // FL
    { x: (2*S) + (armLen*S), z: (-3*S) - (armLen*S*0.5), y: S + armThick },  // FR
    { x: (-2*S) - (armLen*S), z: (3*S) + (armLen*S*0.5), y: 0 + armThick },  // BL
    { x: (2*S) + (armLen*S), z: (3*S) + (armLen*S*0.5), y: 0 + armThick },   // BR
  ];

  motorPositions.forEach(pos => {
    // 馬達座
    add(pos.x, pos.y, pos.z, S*2.5, S, S*2.5, MATERIALS.DARK_MECH, 5);
    // 轉軸
    add(pos.x, pos.y + S, pos.z, S, S/2, S, MATERIALS.BODY_WHITE, 5);
    
    // 槳葉 (兩片) - 這裡做成靜態的「積木」，旋轉由父級 Group 控制
    // 為了視覺效果，我們把槳葉拆成幾段小板
    const bladeLen = 5;
    // Blade 1
    for(let k=1; k<=bladeLen; k++) {
       const color = k === bladeLen ? MATERIALS.ORANGE_ACCENT : MATERIALS.BLACK_PROP;
       add(pos.x + k*S*0.8, pos.y + S*1.2, pos.z + k*S*0.2, S*1.5, S/5, S, color, 5, [0, 0.2, 0]);
    }
    // Blade 2
    for(let k=1; k<=bladeLen; k++) {
       const color = k === bladeLen ? MATERIALS.ORANGE_ACCENT : MATERIALS.BLACK_PROP;
       add(pos.x - k*S*0.8, pos.y + S*1.2, pos.z - k*S*0.2, S*1.5, S/5, S, color, 5, [0, 0.2, 0]);
    }
  });

  return bricks;
};

// --- 螺旋槳組件 ---
const PropellerGroup = ({ 
  bricks, 
  position, 
  isAssembled, 
  progress, 
  direction 
}: { 
  bricks: BrickData[], 
  position: [number, number, number], 
  isAssembled: boolean, 
  progress: number,
  direction: number // 1 for CW, -1 for CCW
}) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    // 當組裝進度到達一定程度（螺旋槳已安裝），且處於組裝狀態時，開始旋轉
    if (isAssembled && progress > 1.2) {
      // 高速旋轉
      groupRef.current.rotation.y += delta * 20 * direction;
    } else if (!isAssembled) {
      // 停止旋轉
       groupRef.current.rotation.y = 0;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {bricks.map((brick) => (
        // 修正積木位置：因為 Group 已經在馬達位置了，積木的 local position 需要減去馬達位置
        <LegoBrick 
          key={brick.id} 
          data={{
            ...brick, 
            pos: [brick.pos[0] - position[0], brick.pos[1] - position[1], brick.pos[2] - position[2]]
          }} 
          isAssembled={isAssembled}
          progress={progress}
        />
      ))}
    </group>
  );
};

// --- 無人機整體組件 ---
const Drone = ({ assemble, flightMode }: { assemble: boolean, flightMode: string }) => {
  // 分離積木數據：機身積木 vs 螺旋槳積木
  const { bodyBricks, propGroups } = useMemo(() => {
    const allBricks = generateComplexDrone();
    const body: BrickData[] = [];
    // 依據馬達位置將螺旋槳分組
    // 這裡我們硬編碼馬達位置來過濾 (從 generateComplexDrone 裡面的邏輯反推)
    // 馬達位置 roughly at: FL(-3.5, -3.5), FR(3.5, -3.5), BL(-3.5, 3.5), BR(3.5, 3.5)
    // 我們可以根據 stage 5 來抓取
    
    const groups: { [key: string]: BrickData[] } = {
      'FL': [], 'FR': [], 'BL': [], 'BR': []
    };

    allBricks.forEach(b => {
      if (b.stage === 5 && b.color !== '#2D2D2D') { 
        // 排除馬達座本身 (DARK_MECH #2D2D2D)，只取轉軸和葉片
        // 根據位置判斷屬於哪個螺旋槳
        if (b.pos[0] < 0 && b.pos[2] < 0) groups['FL'].push(b);
        else if (b.pos[0] > 0 && b.pos[2] < 0) groups['FR'].push(b);
        else if (b.pos[0] < 0 && b.pos[2] > 0) groups['BL'].push(b);
        else if (b.pos[0] > 0 && b.pos[2] > 0) groups['BR'].push(b);
        else body.push(b); // 應該不會發生，除非有正中心的
      } else {
        body.push(b);
      }
    });

    return { 
      bodyBricks: body, 
      propGroups: [
        { name: 'FL', bricks: groups['FL'], pos: [-3.5 * 0.25 - 6 * 0.25, 0.25 + 0.25, -3 * 0.25 - 6 * 0.25 * 0.5], dir: 1 }, 
        // 注意：這裡的位置必須跟 generateComplexDrone 裡的馬達中心完全一致，否則旋轉會偏心
        // 讓我們重新看 generateComplexDrone 的邏輯：
        // motorPositions:
        // FL: x: (-2*S) - (armLen*S), z: (-3*S) - (armLen*S*0.5)
        // S = 0.25, armLen = 6
        // x = -0.5 - 1.5 = -2.0
        // z = -0.75 - 0.75 = -1.5
        // y = S + S = 0.5
        // 讓我們直接用數值
        { name: 'FL', bricks: groups['FL'], pos: [-2.0, 0.5, -1.5], dir: 1 },
        { name: 'FR', bricks: groups['FR'], pos: [2.0, 0.5, -1.5], dir: -1 },
        { name: 'BL', bricks: groups['BL'], pos: [-2.0, 0.25, 1.5], dir: -1 }, // Back arms are lower (y=0 + armThick=0.25) => y=0.25
        { name: 'BR', bricks: groups['BR'], pos: [2.0, 0.25, 1.5], dir: 1 },
      ] as const
    };
  }, []);

  const groupRef = useRef<THREE.Group>(null);
  const [progress, setProgress] = useState(0);
  const flightTime = useRef(0);

  // ... (保留原有的 useFrame 飛行邏輯，這部分不變) ...
  useFrame((state, delta) => {
    // 組裝/拆解進度邏輯
    if (assemble) {
      setProgress(p => Math.min(p + delta * 0.3, 1.5));
    } else {
      setProgress(p => Math.max(p - delta * 0.8, 0));
    }

    if (!groupRef.current) return;

    // 基礎懸停 (當還沒組裝好，或處於 Idle 模式時)
    if (progress > 1.2 && flightMode === 'idle') {
       const t = state.clock.getElapsedTime();
       groupRef.current.position.set(0, Math.sin(t * 1.5) * 0.3, 0);
       groupRef.current.rotation.set(
         Math.sin(t * 0.8) * 0.05, 
         0, 
         Math.cos(t * 0.5) * 0.05
       );
    } 
    // 特技飛行模式邏輯
    else if (progress > 1.2 && assemble) {
      flightTime.current += delta;
      const t = flightTime.current;

      if (flightMode === 'circle') {
        const radius = 6;
        const speed = 0.8;
        const x = Math.cos(t * speed) * radius;
        const z = Math.sin(t * speed) * radius;
        groupRef.current.position.set(x, 0, z);
        groupRef.current.lookAt(0, 0, 0); 
      } 
      else if (flightMode === 'figure8') {
        const scale = 6;
        const speed = 1.0;
        const x = (scale * Math.cos(t * speed)) / (1 + Math.sin(t * speed) ** 2);
        const z = (scale * Math.cos(t * speed) * Math.sin(t * speed)) / (1 + Math.sin(t * speed) ** 2);
        const y = Math.sin(t * speed * 2) * 1.5;
        groupRef.current.position.set(x, y, z);
        const nextT = t + 0.1;
        const nextX = (scale * Math.cos(nextT * speed)) / (1 + Math.sin(nextT * speed) ** 2);
        const nextZ = (scale * Math.cos(nextT * speed) * Math.sin(nextT * speed)) / (1 + Math.sin(nextT * speed) ** 2);
        const nextY = Math.sin(nextT * speed * 2) * 1.5;
        groupRef.current.lookAt(nextX, nextY, nextZ);
        const bankAngle = (x - nextX) * 2; 
        groupRef.current.rotateZ(bankAngle);
      }
      else if (flightMode === 'spiral') {
        const cycle = t % 8; 
        let y, x, z;
        if (cycle < 5) {
          const radius = 3;
          const upSpeed = 2;
          const rotSpeed = 3;
          y = -2 + cycle * upSpeed;
          x = Math.cos(cycle * rotSpeed) * radius;
          z = Math.sin(cycle * rotSpeed) * radius;
          groupRef.current.position.set(x, y, z);
          groupRef.current.lookAt(
            Math.cos((cycle+0.1) * rotSpeed) * radius,
            -2 + (cycle+0.1) * upSpeed,
            Math.sin((cycle+0.1) * rotSpeed) * radius
          );
        } else {
          const dropProgress = (cycle - 5) / 3; 
          groupRef.current.position.lerp(new THREE.Vector3(0, 0, 0), 0.1);
          groupRef.current.rotation.set(0, 0, 0);
        }
      }
      else if (flightMode === 'flip') {
        const cycle = t % 2; 
        if (cycle > 0.5 && cycle < 1.5) {
          const rotateProg = (cycle - 0.5) / 1; 
          groupRef.current.rotation.z = rotateProg * Math.PI * 2;
          groupRef.current.position.y = Math.sin(rotateProg * Math.PI) * 2; 
        } else {
           groupRef.current.rotation.z = 0;
           groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0, 0.1);
        }
      }
    } else {
       if (groupRef.current) {
         groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0, 0.1);
         groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, 0, 0.1);
         groupRef.current.position.z = THREE.MathUtils.lerp(groupRef.current.position.z, 0, 0.1);
         groupRef.current.rotation.set(0,0,0);
       }
    }
  });

  return (
    <group ref={groupRef}>
      {/* 靜態機身部分 */}
      {bodyBricks.map((brick) => (
        <LegoBrick 
          key={brick.id} 
          data={brick} 
          isAssembled={assemble}
          progress={progress}
        />
      ))}

      {/* 動態螺旋槳部分 */}
      {propGroups.map((group, i) => (
        <PropellerGroup 
          key={i}
          bricks={group.bricks}
          position={group.pos as [number, number, number]}
          isAssembled={assemble}
          progress={progress}
          direction={group.dir}
        />
      ))}
      
      {/* 額外的視覺模糊圓盤 (當轉速快時顯示) */}
      <AnimatePresence>
        {progress > 1.2 && assemble && (
           propGroups.map((group, i) => (
             <group key={`blur_${i}`} position={group.pos as [number, number, number]}>
               <mesh rotation={[0, 0, 0]} position={[0, 0.2, 0]}>
                 <cylinderGeometry args={[2.0, 2.0, 0.02, 32]} />
                 <meshBasicMaterial color="#ffffff" transparent opacity={0.1} depthWrite={false} />
               </mesh>
             </group>
           ))
        )}
      </AnimatePresence>
    </group>
  );
};

// --- 主程式 ---
export default function App() {
  const [assemble, setAssemble] = useState(false);
  const [flightMode, setFlightMode] = useState('idle'); // idle, circle, figure8, spiral, flip

  const handleAssembleToggle = () => {
    if (assemble) {
      // 如果正在拆解，先重置飛行模式
      setFlightMode('idle');
    }
    setAssemble(!assemble);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0a0a0a' }}>
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[12, 10, 12]} fov={40} />
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.9} maxDistance={40} minDistance={5} />
        
        <ambientLight intensity={0.4} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <Environment preset="city" />
        
        <spotLight position={[10, 20, 10]} angle={0.3} penumbra={1} intensity={1.5} castShadow shadow-bias={-0.0001} />
        <pointLight position={[-10, 5, -10]} intensity={0.8} color="#4455ff" />
        <pointLight position={[10, -5, 10]} intensity={0.5} color="#ffaa44" />

        <Float rotationIntensity={0} floatIntensity={0}> 
          <Drone assemble={assemble} flightMode={flightMode} />
        </Float>

        <ContactShadows position={[0, -2, 0]} opacity={0.6} scale={40} blur={2} far={10} color="#000000" />
        <gridHelper args={[100, 50, '#333333', '#111111']} position={[0, -2.1, 0]} />
      </Canvas>

      {/* UI 介面 */}
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
             fontFamily: '"Microsoft JhengHei", "Noto Sans TC", sans-serif'
           }}>
             積木<span style={{ color: '#FF6600' }}>無人機</span>
           </h1>
           <p style={{ color: '#aaa', marginTop: '10px', fontSize: '1.2rem', fontFamily: '"Microsoft JhengHei", sans-serif' }}>
             專業航拍旗艦・積木組裝模擬
           </p>
        </header>

        {/* 飛行控制面板 (僅在組裝完成後顯示) */}
        <AnimatePresence>
          {assemble && (
            <motion.div 
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              style={{ 
                position: 'absolute', 
                top: '50%', 
                right: '30px', 
                transform: 'translateY(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                pointerEvents: 'auto'
              }}
            >
               <h3 style={{ color: '#fff', textAlign: 'right', fontFamily: '"Microsoft JhengHei"', borderBottom: '1px solid #444', paddingBottom: '10px' }}>飛行路徑指令</h3>
               
               {[
                 { id: 'idle', label: '懸停待機', icon: '⏹' },
                 { id: 'circle', label: '環繞偵查', icon: '↺' },
                 { id: 'figure8', label: '8字巡航', icon: '∞' },
                 { id: 'spiral', label: '螺旋戰術', icon: '⌇' },
                 { id: 'flip', label: '特技翻滾', icon: '⤾' },
               ].map((mode) => (
                 <button
                   key={mode.id}
                   onClick={() => setFlightMode(mode.id)}
                   style={{
                     padding: '12px 20px',
                     textAlign: 'right',
                     background: flightMode === mode.id ? '#FF6600' : 'rgba(0,0,0,0.6)',
                     color: 'white',
                     border: '1px solid rgba(255,255,255,0.1)',
                     borderRadius: '4px',
                     cursor: 'pointer',
                     fontFamily: '"Microsoft JhengHei"',
                     fontSize: '1rem',
                     display: 'flex',
                     justifyContent: 'space-between',
                     alignItems: 'center',
                     minWidth: '180px',
                     transition: 'all 0.2s'
                   }}
                 >
                   <span>{mode.icon}</span>
                   <span>{mode.label}</span>
                 </button>
               ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ 
          padding: '50px', 
          textAlign: 'center', 
          background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
          pointerEvents: 'auto'
        }}>
          <button 
            onClick={handleAssembleToggle}
            style={{
              padding: '15px 60px',
              fontSize: '1.5rem',
              fontFamily: '"Microsoft JhengHei", sans-serif',
              fontWeight: 'bold',
              color: assemble ? '#fff' : '#000',
              backgroundColor: assemble ? '#444' : '#FF6600',
              border: 'none',
              borderRadius: '2px', 
              cursor: 'pointer',
              clipPath: 'polygon(10% 0, 100% 0, 100% 70%, 90% 100%, 0 100%, 0 30%)',
              transition: 'all 0.3s ease',
              boxShadow: assemble ? 'none' : '0 0 30px rgba(255, 102, 0, 0.4)'
            }}
          >
            {assemble ? '重置組裝' : '開始組裝'}
          </button>
        </div>
      </div>
    </div>
  );
}


