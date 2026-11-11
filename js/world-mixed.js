// Lilies and peonies together. The lilies lead: nine of them, large, opening outward from the
// heart of the bouquet to its edges. Small peonies are tucked into the gaps between them as
// soft, round accents, and slender lily buds reach above.
(function (root) {
  "use strict";
  const PI = Math.PI;
  root.Tenderly.bouquet("mixed", {
    seed: 31337,
    top: -1370,
    flowers: [
      // the back row of lilies
      ["lily",    10, -1034, 196, "white",     0.30,  0.05, 6],
      ["lily",  -262,  -858, 186, "peach",     0.38, -0.55, 8],
      ["lily",   268,  -866, 186, "stargazer", 0.38,  0.58, 9],
      ["lily",     0,  -770, 206, "stargazer", 0.22,  0.00, 3],
      // peonies nestled between them
      ["peony", -128,  -762, 104, "cream",     0.30, -0.20, 12],
      ["peony",  134,  -752, 102, "blush",     0.30,  0.22, 13],
      ["peony", -356,  -604, 100, "blush",     0.48, -0.80, 14],
      ["peony",  360,  -590, 100, "rose",      0.48,  0.82, 15],
      // the lilies at the heart
      ["lily",  -184,  -548, 228, "white",     0.18, -0.25, 1],
      ["lily",   188,  -532, 228, "blush",     0.18,  0.30, 2],
      ["lily",  -284,  -330, 168, "blush",     0.42, -1.15, 10],
      ["lily",   290,  -316, 168, "white",     0.42,  1.20, 11],
      ["peony",    2,  -508, 108, "rose",      0.14,  0.00, 5],
      ["lily",     2,  -296, 222, "stargazer", 0.12,  0.06, 0],
      // a low collar of small peonies
      ["peony", -136,  -176,  88, "cream",     0.30, -0.50, 16],
      ["peony",  142,  -168,  88, "blush",     0.30,  0.52, 17],
    ],
    buds: [
      ["lily",  -118, -1166, 150, "stargazer"],
      ["lily",   140, -1178, 160, "white"],
      ["lily",  -410,  -846, 130, "peach"],
      ["lily",   416,  -838, 130, "blush"],
    ],
    // foliage starts above the paper's edge, so the wrap stays in view
    leaves: [
      [ -70, -150, PI + 0.35, 210], [  74, -156, -0.33, 205],
      [-230, -230, PI + 0.20, 170], [ 234, -220, -0.18, 170],
    ],
    // long, narrow lily leaves
    blades: [
      [ -60, -190, PI + 0.42, 300, 24, 0.10], [  62, -200, -0.44, 300, 24, 0.12],
      [ -56, -150, PI + 0.16, 320, 25, 0.08], [  58, -160, -0.14, 310, 25, 0.10],
      [ -40, -120, PI + 0.70, 240, 22, 0.08], [  40, -118, -0.72, 235, 22, 0.10],
      [-250, -500, PI + 0.30, 230, 20, 0.10], [ 256, -480, -0.26, 230, 20, 0.12],
      [-240, -820, PI + 0.80, 210, 18, 0.08], [ 246, -810, -0.78, 210, 18, 0.08],
      [ -70, -1010, -1.95, 190, 17, 0.08],    [  96, -1020, -1.22, 190, 17, 0.08],
    ],
  });
})(typeof window !== "undefined" ? window : globalThis);
