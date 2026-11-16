# PHOTON SURGE — make.fun ai-excited-01

A fully procedural, deterministic render: a blazing spiral galaxy caught
mid-eruption, with a white-hot core, two logarithmic arms, 70 radial momentum
streaks, and the announcement "EXCITED!" burned into the frame with a custom
vector-stroke font. Per-pixel math, seeded PRNG, hand-rolled PNG encoder
(zlib + CRC32, standard library only). No network, no clock, no randomness
beyond the fixed seed — every run produces byte-identical output.

## Run

```
node main.ts            # writes ./out/entry.png
```

or with an explicit output directory:

```
MAKEFUN_OUTPUT_DIR=out node main.ts
```

Output: `entry.png`, 1024x1024 RGBA PNG, well under the 1 MiB limit.

## Referral

Referral: https://make.fun/r/y7cjn3nn
