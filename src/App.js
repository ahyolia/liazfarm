import { useRef, useEffect, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls } from "@react-three/drei";
import { useControls, Leva } from "leva";
import * as THREE from "three";

const TARGET_HEIGHT = 2;

// Calcule scale et offsetY pour poser le modèle exactement sur le sol
function computeScaleAndOffset(scene, targetHeight) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const s = size.y > 0 ? targetHeight / size.y : 1;
  const offsetY = -box.min.y * s; // remonte le modèle pour que sa base soit à y=0
  return { s, offsetY };
}

// --- Composant modèle statique ---
function Model({ path, position, scale }) {
  const { scene } = useGLTF(path);
  const [transform, setTransform] = useState({ s: 1, offsetY: 0 });

  useEffect(() => {
    setTransform(computeScaleAndOffset(scene, TARGET_HEIGHT));
  }, [scene]);

  const finalPos = [position[0], position[1] + transform.offsetY, position[2]];

  return (
    <primitive object={scene} position={finalPos} scale={scale ?? transform.s} />
  );
}

// --- Composant modèle animé ---
function AnimatedModel({ path, position, scale }) {
  const group = useRef();
  const { scene, animations } = useGLTF(path);
  const { actions, names } = useAnimations(animations, group);
  const [transform, setTransform] = useState({ s: 1, offsetY: 0 });

  useEffect(() => {
    setTransform(computeScaleAndOffset(scene, TARGET_HEIGHT));
  }, [scene]);

  useEffect(() => {
    console.log(`[${path}] Animations disponibles :`, names);
  }, [names]);

  const handleClick = () => {
    if (names.length > 0) {
      actions[names[0]]?.reset().fadeIn(0.3).play();
    } else {
      console.warn("Ce modèle n'a pas d'animations !");
    }
  };

  const finalPos = [position[0], position[1] + transform.offsetY, position[2]];

  return (
    <group ref={group} position={finalPos} onClick={handleClick}>
      <primitive object={scene} scale={scale ?? transform.s} />
    </group>
  );
}

// --- Sol ---
function Floor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#2d4a1e" />
    </mesh>
  );
}

// --- Écran de chargement ---
function Loader() {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#1a1a2e",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontSize: "1.5rem", fontFamily: "sans-serif"
    }}>
      Chargement...
    </div>
  );
}

// --- Preload de tous les modèles ---
const STATIC_MODELS = [
  { path: "/models/Chicken.glb",          position: [-8, 0, 0] },
  { path: "/models/Crops.glb",            position: [0,  0, 0] },
  { path: "/models/Hen.glb",              position: [4,  0, 0] },
  { path: "/models/Low Poly Haunter.glb", position: [8,  0, 0] },
];
const ANIMATED_MODELS = [
  { path: "/models/Cow.glb",     position: [-4, 0, 0] },
  { path: "/models/DORAEMON.glb", position: [0, 0, 4] },
];

[...STATIC_MODELS, ...ANIMATED_MODELS].forEach((m) => useGLTF.preload(m.path));

// --- Scène ---
export default function App() {
  return (
    <>
      <Suspense fallback={<Loader />}>
        <Canvas
          shadows
          camera={{ position: [0, 4, 14], fov: 60 }}
          style={{ width: "100%", height: "100%", background: "#1a1a2e" }}
        >
          <ambientLight intensity={1.5} />
          <directionalLight position={[10, 10, 5]} intensity={2} castShadow />

          <Floor />

          {STATIC_MODELS.map((m) => (
            <Model key={m.path} path={m.path} position={m.position} />
          ))}

          {ANIMATED_MODELS.map((m) => (
            <AnimatedModel key={m.path} path={m.path} position={m.position} />
          ))}

          <OrbitControls />
        </Canvas>
      </Suspense>
    </>
  );
}
