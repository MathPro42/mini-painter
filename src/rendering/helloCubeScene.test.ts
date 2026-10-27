import { Color, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createHelloCubeScene, CUBE_SPIN_SPEED } from './helloCubeScene';

const expectedColor = (hex: number): string => new Color(hex).getHexString();

describe('createHelloCubeScene', () => {
  it('adds the cube to the scene with the requested color', () => {
    const view = createHelloCubeScene('#ff8000');
    expect(view.scene.children).toContain(view.cube);
    expect(view.cube.material.color.getHexString()).toBe(expectedColor(0xff8000));
  });

  it('lights the scene', () => {
    const { scene } = createHelloCubeScene('#ffffff');
    const lights = scene.children.filter((child) => 'isLight' in child);
    expect(lights.length).toBeGreaterThanOrEqual(1);
  });

  it('points the camera at the cube', () => {
    const { camera, cube } = createHelloCubeScene('#ffffff');
    const viewDirection = camera.getWorldDirection(new Vector3());
    const toCube = cube.position.clone().sub(camera.position).normalize();
    expect(viewDirection.angleTo(toCube)).toBeCloseTo(0);
  });

  it('rejects an invalid initial color', () => {
    expect(() => createHelloCubeScene('teal')).toThrow(RangeError);
  });
});

describe('HelloCubeScene', () => {
  it('setColor changes the cube color', () => {
    const view = createHelloCubeScene('#000000');
    view.setColor('#00f');
    expect(view.cube.material.color.getHexString()).toBe(expectedColor(0x0000ff));
  });

  it('setAspect updates the camera projection', () => {
    const view = createHelloCubeScene('#000000');
    const before = view.camera.projectionMatrix.clone();
    view.setAspect(2);
    expect(view.camera.aspect).toBe(2);
    expect(view.camera.projectionMatrix.equals(before)).toBe(false);
  });

  it('tick spins the cube proportionally to elapsed time', () => {
    const view = createHelloCubeScene('#000000');
    view.tick(0.5);
    expect(view.cube.rotation.x).toBeCloseTo(CUBE_SPIN_SPEED.x * 0.5);
    expect(view.cube.rotation.y).toBeCloseTo(CUBE_SPIN_SPEED.y * 0.5);
  });

  it('dispose frees the geometry and material', () => {
    const view = createHelloCubeScene('#000000');
    const geometryDispose = vi.spyOn(view.cube.geometry, 'dispose');
    const materialDispose = vi.spyOn(view.cube.material, 'dispose');
    view.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
