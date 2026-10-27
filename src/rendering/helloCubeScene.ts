import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from 'three';
import { hexColorToInt } from '../utils/color';

/** Radians per second around each axis. */
export const CUBE_SPIN_SPEED = { x: 0.4, y: 0.7 } as const;

export interface HelloCubeScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly cube: Mesh<BoxGeometry, MeshStandardMaterial>;
  /** Sets the cube's base color from a hex string. */
  setColor: (hex: string) => void;
  /** Updates the camera for a new viewport width / height ratio. */
  setAspect: (aspect: number) => void;
  /** Advances the spin animation by `deltaSeconds`. */
  tick: (deltaSeconds: number) => void;
  /** Frees GPU resources held by the cube. */
  dispose: () => void;
}

/**
 * Builds the placeholder "hello cube" scene. Pure Three.js object setup with
 * no renderer, so it runs (and is tested) without WebGL.
 */
export function createHelloCubeScene(color: string): HelloCubeScene {
  const scene = new Scene();

  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);

  const cube = new Mesh(
    new BoxGeometry(1.5, 1.5, 1.5),
    new MeshStandardMaterial({ color: hexColorToInt(color), roughness: 0.6 }),
  );
  scene.add(cube);

  const keyLight = new DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight, new AmbientLight(0xffffff, 0.6));

  return {
    scene,
    camera,
    cube,
    setColor: (hex) => {
      cube.material.color.setHex(hexColorToInt(hex));
    },
    setAspect: (aspect) => {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
    tick: (deltaSeconds) => {
      cube.rotation.x += CUBE_SPIN_SPEED.x * deltaSeconds;
      cube.rotation.y += CUBE_SPIN_SPEED.y * deltaSeconds;
    },
    dispose: () => {
      cube.geometry.dispose();
      cube.material.dispose();
    },
  };
}
