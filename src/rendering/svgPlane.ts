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
  /** Id of the region under the ray, or `null` when the ray misses the drawing or its regions. */
  pickRegion: (raycaster: Raycaster) => string | null;
  /** Frees the geometry and material. The texture belongs to whoever created it. */
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
 * Pure Three.js setup, so it runs (and is tested) without WebGL.
 */
export function createSvgPlane(svg: ParsedSvg, texture: Texture): SvgPlane {
  const { viewBox } = svg;
  const scale = SVG_PLANE_SIZE / Math.max(viewBox.width, viewBox.height);
  const mesh = new Mesh(
    new PlaneGeometry(viewBox.width * scale, viewBox.height * scale),
    new MeshBasicMaterial({ map: texture, side: DoubleSide, transparent: true }),
  );
  return {
    mesh,
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
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
