/**
 * Vehicle simulation — placeholder. Owned by the physics work stream.
 * Must implement a raycast-suspension vehicle: per-wheel spring/damper, a
 * Pacejka tyre model with load sensitivity and relaxation, engine + clutch +
 * gearbox torque path, weight transfer, ABS-free brakes, and steering with
 * Ackermann and self-centring. Read every constant from @/spec.
 */
import * as THREE from 'three';
import type { Car } from '@/car/Car';
import type { VehicleState } from '@/types';
import type { ControlInput } from '@/ui/input';
import { ENGINE } from '@/spec';

export class VehicleSim {
  private state: VehicleState = {
    speed: 0,
    velocity: new THREE.Vector3(),
    engineRpm: ENGINE.idleRpm,
    gear: 1,
    throttle: 0, brake: 0, clutch: 0, handbrake: 0,
    steerAngle: 0,
    wheelSpin: [0, 0, 0, 0],
    wheelSlip: [0, 0, 0, 0],
    suspensionCompression: [0.5, 0.5, 0.5, 0.5],
    wheelContact: [true, true, true, true],
    pitch: 0, roll: 0, yawRate: 0,
    gForce: new THREE.Vector2(),
    lights: { low: false, high: false, brake: false, reverse: false, hazard: false, indicator: 0, fog: false },
    wipers: 0,
    engineRunning: true,
    odometer: 0,
  };

  constructor(private car: Car) {}

  step(_dt: number, _input: ControlInput): VehicleState {
    return this.state;
  }
}
