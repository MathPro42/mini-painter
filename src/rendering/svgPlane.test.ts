import { PerspectiveCamera, Raycaster, Texture, Vector2 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { parseSvg } from '../utils/svg/parseSvg';
import { createSvgPlane, MAX_TEXTURE_SIZE, SVG_PLANE_SIZE, textureSize } from './svgPlane';

// 200 × 100 drawing: "left" fills the left half, the right half is empty.
const DRAWING = parseSvg(
  '<svg viewBox="100 50 200 100"><rect id="left" x="100" y="50" width="100" height="100"/></svg>',
);

/** A ray from a camera on the +Z axis through normalized device coordinates (x, y). */
const rayThrough = (x: number, y: number, cameraZ = 4): Raycaster => {
  const camera = new PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.set(0, 0, cameraZ);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(x, y), camera);
  return raycaster;
};

describe('textureSize', () => {
  it('keeps the aspect ratio with the longer side at the maximum', () => {
    expect(textureSize({ x: 0, y: 0, width: 200, height: 100 })).toEqual({
      width: MAX_TEXTURE_SIZE,
      height: MAX_TEXTURE_SIZE / 2,
    });
    expect(textureSize({ x: 0, y: 0, width: 300, height: 1000 }, 100)).toEqual({
      width: 30,
      height: 100,
    });
  });

  it('never returns a zero dimension', () => {
    expect(textureSize({ x: 0, y: 0, width: 10000, height: 1 }, 100).height).toBe(1);
  });
});

describe('createSvgPlane', () => {
  it('sizes the plane to the drawing with the longer side fixed', () => {
    const { mesh } = createSvgPlane(DRAWING, new Texture());
    expect(mesh.geometry.parameters.width).toBe(SVG_PLANE_SIZE);
    expect(mesh.geometry.parameters.height).toBe(SVG_PLANE_SIZE / 2);
  });

  it('shows the texture on both sides', () => {
    const texture = new Texture();
    const { mesh } = createSvgPlane(DRAWING, texture);
    expect(mesh.material.map).toBe(texture);
    expect(mesh.material.side).toBe(2);
    expect(mesh.material.transparent).toBe(true);
  });

  it('picks the region under a ray, mapping the plane to viewBox coordinates', () => {
    const plane = createSvgPlane(DRAWING, new Texture());
    expect(plane.pickRegion(rayThrough(-0.2, 0.1))).toBe('region-0');
    expect(plane.pickRegion(rayThrough(0.2, 0.1))).toBeNull();
  });

  it('picks from behind as well, since the plane is double-sided', () => {
    const plane = createSvgPlane(DRAWING, new Texture());
    // Seen from -Z the drawing is mirrored: screen-right is the drawing's left half.
    expect(plane.pickRegion(rayThrough(0.2, 0, -4))).toBe('region-0');
  });

  it('returns null when the ray misses the plane', () => {
    const plane = createSvgPlane(DRAWING, new Texture());
    expect(plane.pickRegion(rayThrough(0, 0.95))).toBeNull();
  });

  it('dispose frees the geometry and material but not the texture', () => {
    const texture = new Texture();
    const plane = createSvgPlane(DRAWING, texture);
    const geometryDispose = vi.spyOn(plane.mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(plane.mesh.material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    plane.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).not.toHaveBeenCalled();
  });
});
