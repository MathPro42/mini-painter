import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import type { Raycaster, Texture } from 'three';
import { findRegionAt } from '../utils/svg/hitTest';
import type { ParsedSvg, ViewBox } from '../utils/svg/types';

/** World-space length of the plane's longer side. The placeholder cube is 1.5 wide. */
export const SVG_PLANE_SIZE = 3;

/** Longest texture side in pixels: supported by every WebGL device and sharp at normal zoom. */
export const MAX_TEXTURE_SIZE = 2048;

export interface SvgPlane {
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Shows the overlay texture over the drawing; a child of `mesh`. */
  readonly overlay: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** Id of the region under the ray, or `null` when the ray misses the drawing or its regions. */
  pickRegion: (raycaster: Raycaster) => string | null;
  /** Frees the geometry and materials. The textures belong to whoever created them. */
  dispose: () => void;
}

/** Whole-pixel texture size with the viewBox's aspect ratio and `maxSize` on its longer side. */
export function textureSize(
  viewBox: ViewBox,
  maxSize: number = MAX_TEXTURE_SIZE,
): { width: number; height: number } {
  const scale = maxSize / Math.max(viewBox.width, viewBox.height);
  return {
    width: Math.max(1, Math.round(viewBox.width * scale)),
    height: Math.max(1, Math.round(viewBox.height * scale)),
  };
}

/**
 * A flat, double-sided plane showing `texture`, sized to the drawing's aspect
 * ratio and centered on the origin, facing +Z like the camera's start position.
 * `overlay` (the selection outlines) is drawn on top of it, on a second plane
 * that shares the geometry, so it can change without repainting `texture`.
 * Pure Three.js setup, so it runs (and is tested) without WebGL.
 */
export function createSvgPlane(svg: ParsedSvg, texture: Texture, overlay: Texture): SvgPlane {
  const { viewBox } = svg;
  const scale = SVG_PLANE_SIZE / Math.max(viewBox.width, viewBox.height);
  const geometry = new PlaneGeometry(viewBox.width * scale, viewBox.height * scale);
  const mesh = new Mesh(geometry, planeMaterial(texture));
  const overlayMesh = new Mesh(geometry, planeMaterial(overlay));
  // Coplanar with the drawing: skip the depth test and draw after it instead.
  overlayMesh.material.depthTest = false;
  overlayMesh.renderOrder = 1;
  mesh.add(overlayMesh);
  return {
    mesh,
    overlay: overlayMesh,
    pickRegion: (raycaster) => {
      const uv = raycaster.intersectObject(mesh, false)[0]?.uv;
      if (uv === undefined) {
        return null;
      }
      // UV (0, 0) is the plane's bottom-left corner; SVG y grows downward.
      const point = {
        x: viewBox.x + uv.x * viewBox.width,
        y: viewBox.y + (1 - uv.y) * viewBox.height,
      };
      return findRegionAt(svg.regions, point)?.id ?? null;
    },
    dispose: () => {
      geometry.dispose();
      mesh.material.dispose();
      overlayMesh.material.dispose();
    },
  };
}

function planeMaterial(map: Texture): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    side: DoubleSide,
    transparent: true,
    // A flat plane has no back faces to sort, so one pass draws both sides.
    forceSinglePass: true,
  });
}
