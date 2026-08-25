import React, { useRef, useEffect, useState, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF, useAnimations, OrbitControls } from "@react-three/drei";
import {
  EffectComposer,
  DepthOfField,
  Bloom,
  Vignette,
  HueSaturation,
} from "@react-three/postprocessing";
import { useControls, folder, levaStore } from "leva";
import { Physics, RigidBody } from "@react-three/rapier";
import * as THREE from "three";

const TARGET_HEIGHT = 2;
const STORAGE_KEY = "farm-scene-controls";

// Charge les valeurs sauvegardées du panneau (une fois, au chargement du module)
function loadPersistedControls() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}
const persistedControls = loadPersistedControls();

// Retourne la valeur sauvegardée pour ce contrôle, sinon la valeur par défaut
function withSaved(category, label, field, fallback) {
  const path = [category, label, field].filter(Boolean).join(".");
  const saved = persistedControls[path];
  return saved !== undefined ? saved : fallback;
}

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
function Model({ category, label, path, position, rotation = [0, 0, 0], scaleMultiplier = 1 }) {
  const { scene } = useGLTF(path);
  const [transform, setTransform] = useState({ s: 1, offsetY: 0 });

  useEffect(() => {
    setTransform(computeScaleAndOffset(scene, TARGET_HEIGHT));
  }, [scene]);

  const { posX, posY, posZ, rotX, rotY, rotZ, scale } = useControls(
    category,
    {
      [label]: folder(
        {
          posX: { value: withSaved(category, label, "posX", position[0]), min: -20, max: 20, step: 0.1 },
          posY: { value: withSaved(category, label, "posY", position[1]), min: -5, max: 10, step: 0.1 },
          posZ: { value: withSaved(category, label, "posZ", position[2]), min: -20, max: 20, step: 0.1 },
          rotX: { value: withSaved(category, label, "rotX", rotation[0]), min: -Math.PI, max: Math.PI, step: 0.01 },
          rotY: { value: withSaved(category, label, "rotY", rotation[1]), min: -Math.PI, max: Math.PI, step: 0.01 },
          rotZ: { value: withSaved(category, label, "rotZ", rotation[2]), min: -Math.PI, max: Math.PI, step: 0.01 },
          scale: { value: withSaved(category, label, "scale", scaleMultiplier), min: 0.1, max: 5, step: 0.05 },
        },
        { collapsed: true }
      ),
    },
    { collapsed: true },
    [label]
  );

  const finalPos = [posX, posY + transform.offsetY, posZ];

  return (
    <primitive
      object={scene}
      dispose={null}
      position={finalPos}
      rotation={[rotX, rotY, rotZ]}
      scale={transform.s * scale}
    />
  );
}

// --- Composant modèle animé ---
function AnimatedModel({ category, label, path, position, rotation = [0, 0, 0], scaleMultiplier = 1 }) {
  const group = useRef();
  const { scene, animations } = useGLTF(path);
  const { actions, names } = useAnimations(animations, group);
  const [transform, setTransform] = useState({ s: 1, offsetY: 0 });

  useEffect(() => {
    setTransform(computeScaleAndOffset(scene, TARGET_HEIGHT));
  }, [scene]);

  useEffect(() => {
    console.log(`[${path}] Animations disponibles :`, names);
  }, [path, names]);

  const { posX, posY, posZ, rotX, rotY, rotZ, scale } = useControls(
    category,
    {
      [label]: folder(
        {
          posX: { value: withSaved(category, label, "posX", position[0]), min: -20, max: 20, step: 0.1 },
          posY: { value: withSaved(category, label, "posY", position[1]), min: -5, max: 10, step: 0.1 },
          posZ: { value: withSaved(category, label, "posZ", position[2]), min: -20, max: 20, step: 0.1 },
          rotX: { value: withSaved(category, label, "rotX", rotation[0]), min: -Math.PI, max: Math.PI, step: 0.01 },
          rotY: { value: withSaved(category, label, "rotY", rotation[1]), min: -Math.PI, max: Math.PI, step: 0.01 },
          rotZ: { value: withSaved(category, label, "rotZ", rotation[2]), min: -Math.PI, max: Math.PI, step: 0.01 },
          scale: { value: withSaved(category, label, "scale", scaleMultiplier), min: 0.1, max: 5, step: 0.05 },
        },
        { collapsed: true }
      ),
    },
    { collapsed: true },
    [label]
  );

  const handleClick = () => {
    if (names.length > 0) {
      actions[names[0]]?.reset().fadeIn(0.3).play();
    } else {
      console.warn("Ce modèle n'a pas d'animations !");
    }
  };

  const finalPos = [posX, posY + transform.offsetY, posZ];

  return (
    <group ref={group} position={finalPos} rotation={[rotX, rotY, rotZ]} onClick={handleClick}>
      <primitive object={scene} dispose={null} scale={transform.s * scale} />
    </group>
  );
}

// --- Sol (solide et immobile, sert de collision pour la physique) ---
// DEBUG: TEST_DISABLE_PHYSICS=true retire temporairement Rapier pour isoler le bug d'affichage
const TEST_DISABLE_PHYSICS = true;

function FloorMesh() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[40, 40]} />
      <meshStandardMaterial color="#2d4a1e" />
    </mesh>
  );
}

function Floor() {
  if (TEST_DISABLE_PHYSICS) return <FloorMesh />;
  return (
    <RigidBody type="fixed" colliders="cuboid" friction={1}>
      <FloorMesh />
    </RigidBody>
  );
}

// --- Modèle soumis à la gravité (tombe et rebondit sur le sol) ---
function FallingModel({ label, path, position, scaleMultiplier = 1 }) {
  const bodyRef = useRef(null);
  const { scene } = useGLTF(path);
  const [transform, setTransform] = useState({ s: 1, offsetY: 0 });

  useEffect(() => {
    setTransform(computeScaleAndOffset(scene, TARGET_HEIGHT));
  }, [scene]);

  const { restitution, dropHeight } = useControls("Physique (Rapier)", {
    [label]: folder(
      {
        restitution: { value: withSaved("Physique (Rapier)", label, "restitution", 0.6), min: 0, max: 1, step: 0.05 },
        dropHeight: { value: withSaved("Physique (Rapier)", label, "dropHeight", position[1]), min: 0, max: 15, step: 0.5 },
      },
      { collapsed: true }
    ),
  });

  // Repositionne le corps physique (sans démonter/remonter le modèle) quand la hauteur de chute change
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.setTranslation({ x: position[0], y: dropHeight, z: position[2] }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, [dropHeight, position]);

  return (
    <RigidBody
      ref={bodyRef}
      position={[position[0], dropHeight, position[2]]}
      colliders="hull"
      restitution={restitution}
      friction={0.8}
    >
      <primitive object={scene} dispose={null} scale={transform.s * scaleMultiplier} />
    </RigidBody>
  );
}

// --- Capture les erreurs pour éviter un écran blanc silencieux ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Erreur dans la scène 3D :", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: "fixed", inset: 0, background: "#300", color: "white", padding: 20, fontFamily: "monospace", whiteSpace: "pre-wrap", overflow: "auto" }}>
          Erreur : {String(this.state.error?.message || this.state.error)}
          {"\n\n"}
          {this.state.error?.stack}
        </div>
      );
    }
    return this.props.children;
  }
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
  { category: "Personnages", label: "Poulet",  path: "/models/Chicken.glb",          position: [-8, 0, 0] },
  { category: "Personnages", label: "Poule",   path: "/models/Hen.glb",              position: [4,  0, 0] },
  { category: "Personnages", label: "Haunter", path: "/models/Low Poly Haunter.glb", position: [8,  0, 0] },
  { category: "Décor",       label: "Récolte",       path: "/models/Crops.glb",                                              position: [0,   0, 0] },
  { category: "Décor",       label: "Étal de marché 1", path: "/models/Market Stalls by Quaternius - 4ZAhRv2tLG.glb",       position: [-6, 0, -11.6] },
  { category: "Décor",       label: "Étal de marché 2", path: "/models/Market Stalls by Quaternius - jSqGy8V0MQ.glb",       position: [4.8, 0, -12.4], scaleMultiplier: 2 },
  { category: "Décor",       label: "Banc",             path: "/models/Park Bench by Sammy - 3ytbP2GLb0b.glb",              position: [-4, 0, 9.2] },
  { category: "Véhicules",   label: "Camion à poulets", path: "/models/Chicken Truck by John Ingram - 8YPlI6aoZvP.glb",     position: [13.5, 1.3, -2], rotation: [0, 1.5, 0], scaleMultiplier: 3.1 },
  { category: "Véhicules",   label: "Camion ouvert",    path: "/models/Open Truck by yang leo - a9BBXYUpw2g.glb",           position: [7.6, 0.9, 10.1], scaleMultiplier: 2.3 },
  { category: "Véhicules",   label: "Camion sushi",     path: "/models/Sushi Truck by Quaternius - OgrROxABGT.glb",         position: [-13.5, 0, 2.2], scaleMultiplier: 3.9 },
];
const ANIMATED_MODELS = [
  { category: "Personnages", label: "Vache",    path: "/models/Cow.glb",      position: [-4, 0, 0] },
  { category: "Personnages", label: "Doraemon", path: "/models/DORAEMON.glb", position: [0, 0, 4] },
];

// Précharge les modèles par petits paquets pour éviter de saturer le GPU
// d'un coup au démarrage (cause de "WebGL Context Lost" sur certaines machines)
const ALL_MODELS_ORDERED = [
  ...STATIC_MODELS.map((m) => ({ ...m, type: "static" })),
  ...ANIMATED_MODELS.map((m) => ({ ...m, type: "animated" })),
];
const ALL_MODEL_PATHS = ALL_MODELS_ORDERED.map((m) => m.path);
(function preloadStaggered(paths, batchSize = 3, delay = 150) {
  paths.slice(0, batchSize).forEach((p) => useGLTF.preload(p));
  const rest = paths.slice(batchSize);
  if (rest.length > 0) {
    setTimeout(() => preloadStaggered(rest, batchSize, delay), delay);
  }
})(ALL_MODEL_PATHS);

// Nombre de modèles à monter par "vague" : au-delà d'un certain nombre de
// modèles ajoutés dans la même frame, la compilation simultanée de tous
// leurs shaders/matériaux peut déclencher un reset du driver GPU (Context
// Lost). On les révèle donc progressivement plutôt que tous d'un coup.
const REVEAL_BATCH_SIZE = 3;
const REVEAL_DELAY_MS = 300;

function useProgressiveReveal(total) {
  const [count, setCount] = useState(Math.min(REVEAL_BATCH_SIZE, total));

  useEffect(() => {
    if (count >= total) return;
    const timer = setTimeout(() => {
      setCount((c) => Math.min(c + REVEAL_BATCH_SIZE, total));
    }, REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [count, total]);

  return count;
}

// --- Scène ---
export default function App() {
  // Sauvegarde automatique de tous les réglages du panneau à chaque changement
  useEffect(() => {
    const unsubscribe = levaStore.useStore.subscribe(() => {
      const data = levaStore.getData();
      const toSave = {};
      Object.entries(data).forEach(([path, { value }]) => {
        toSave[path] = value;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    });
    return unsubscribe;
  }, []);

  const { focusDistance, focalLength, bokehScale } = useControls("Depth of Field", {
    focusDistance: { value: withSaved("Depth of Field", "", "focusDistance", 0.02), min: 0, max: 0.1, step: 0.001 },
    focalLength: { value: withSaved("Depth of Field", "", "focalLength", 0.05), min: 0, max: 1, step: 0.01 },
    bokehScale: { value: withSaved("Depth of Field", "", "bokehScale", 3), min: 0, max: 10, step: 0.5 },
  });

  const { bloomIntensity, vignetteDarkness, warmth, fogDensity } = useControls("Ambiance Ferme", {
    bloomIntensity: { value: withSaved("Ambiance Ferme", "", "bloomIntensity", 0.6), min: 0, max: 3, step: 0.1 },
    vignetteDarkness: { value: withSaved("Ambiance Ferme", "", "vignetteDarkness", 0.6), min: 0, max: 1.5, step: 0.05 },
    warmth: { value: withSaved("Ambiance Ferme", "", "warmth", 0.08), min: -0.2, max: 0.2, step: 0.01 },
    fogDensity: { value: withSaved("Ambiance Ferme", "", "fogDensity", 0.035), min: 0, max: 0.15, step: 0.005 },
  });

  const revealedCount = useProgressiveReveal(ALL_MODELS_ORDERED.length);
  const revealedModels = ALL_MODELS_ORDERED.slice(0, revealedCount);
  const visibleStaticModels = revealedModels.filter((m) => m.type === "static");
  const visibleAnimatedModels = revealedModels.filter((m) => m.type === "animated");

  const { enableEffects } = useControls("Rendu", {
    enableEffects: { value: withSaved("Rendu", "", "enableEffects", false), label: "Post-processing" },
  });

  return (
    <>
      <ErrorBoundary>
      <Suspense fallback={<Loader />}>
        <Canvas
          dpr={1}
          gl={{ antialias: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
          camera={{ position: [0, 4, 14], fov: 60 }}
          style={{ width: "100%", height: "100%", background: "#1a1a2e" }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              console.warn("WebGL context lost, tentative de restauration...");
            });
            gl.domElement.addEventListener("webglcontextrestored", () => {
              console.warn("WebGL context restauré, rechargement de la page.");
              window.location.reload();
            });
          }}
        >
          <fogExp2 attach="fog" args={["#f5c98a", fogDensity]} />

          <ambientLight intensity={1.5} color="#fff1d6" />
          <directionalLight position={[10, 10, 5]} intensity={2} color="#ffd9a0" />

          {TEST_DISABLE_PHYSICS ? (
            <>
              <Floor />

              {visibleStaticModels.map((m) => (
                <Model key={m.path} category={m.category} label={m.label} path={m.path} position={m.position} rotation={m.rotation} scaleMultiplier={m.scaleMultiplier} />
              ))}

              {visibleAnimatedModels.map((m) => (
                <AnimatedModel key={m.path} category={m.category} label={m.label} path={m.path} position={m.position} />
              ))}
            </>
          ) : (
            <Physics gravity={[0, -9.81, 0]}>
              <Floor />

              {visibleStaticModels.map((m) => (
                <Model key={m.path} category={m.category} label={m.label} path={m.path} position={m.position} rotation={m.rotation} scaleMultiplier={m.scaleMultiplier} />
              ))}

              {visibleAnimatedModels.map((m) => (
                <AnimatedModel key={m.path} category={m.category} label={m.label} path={m.path} position={m.position} />
              ))}

              <FallingModel label="Poulet qui tombe" path="/models/Chicken.glb" position={[0, 8, -8]} />
            </Physics>
          )}

          <OrbitControls />

          {enableEffects && (
            <EffectComposer>
              <DepthOfField
                focusDistance={focusDistance}
                focalLength={focalLength}
                bokehScale={bokehScale}
              />
              <Bloom intensity={bloomIntensity} luminanceThreshold={0.3} luminanceSmoothing={0.9} />
              <HueSaturation hue={0} saturation={warmth} />
              <Vignette eskil={false} offset={0.2} darkness={vignetteDarkness} />
            </EffectComposer>
          )}
        </Canvas>
      </Suspense>
      </ErrorBoundary>
    </>
  );
}
