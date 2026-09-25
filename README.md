# Audi 5000 S Wagon · C3 / Type 44

A photoreal, drivable 3D reconstruction of a 1988 Audi 5000 S Wagon in
Graphite Metallic — built entirely in code with Three.js, no imported mesh
assets.

**[→ Open the model](https://eugeneyip.github.io/5000/)**

The car is modelled from a period photograph of one specific example: paint
colour and licence plate are derived from that photograph by measurement, not
by eye. See [docs/REFERENCE-PHOTO.md](docs/REFERENCE-PHOTO.md) for the
colour-science derivation.

## Controls

| | |
|---|---|
| `W` `A` `S` `D` / arrows | drive |
| `Space` | handbrake |
| `Shift` / `Ctrl` | shift up / down |
| `1`–`6`, `0` | camera views |
| `O` `P` `L` | open door / bonnet / tailgate |
| drag, scroll | orbit, zoom |

## Development

```bash
npm install
npm run dev
```

Screenshots for review are produced by the same renderer as the live page:

```bash
npm run shot -- --views=front3q,side --out=renders/round1
```

## Structure

| Path | Owns |
|---|---|
| `src/spec.ts` | every dimension, ratio and colour — the single source of truth |
| `src/car/hardpoints.ts` | the package drawing: fixed attachment points shared by all geometry |
| `src/car/` | body, glass, wheels, lamps, trim, interior, underbody |
| `src/materials/` | paint (flake + clearcoat), glass, chrome, rubber, fabric |
| `src/scene/` | environment, IBL, camera rig, post-processing |
| `src/physics/` | raycast-suspension vehicle dynamics |
| `src/audio/` | synthesised inline-5 |
| `src/ui/` | input and HUD |
