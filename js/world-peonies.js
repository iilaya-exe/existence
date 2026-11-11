// The peony bouquet: eleven full peonies and a few tight buds on fanned stems, with dark
// three-part leaves tucked between them.
(function (root) {
  "use strict";
  const PI = Math.PI;
  root.Tenderly.bouquet("peonies", {
    seed: 90210,
    flowers: [
      ["peony",   12, -1012, 142, "cream",    0.40,  0.00, 6],
      ["peony", -218,  -905, 150, "rose",     0.42, -0.38, 7],
      ["peony",  232,  -912, 150, "blush",    0.42,  0.38, 8],
      ["peony", -318,  -668, 150, "coral",    0.48, -0.70, 9],
      ["peony",  322,  -650, 152, "burgundy", 0.48,  0.70, 10],
      ["peony", -292,  -372, 132, "lilac",    0.55, -1.00, 11],
      ["peony",  296,  -352, 134, "cream",    0.55,  1.00, 12],
      ["peony",    0,  -800, 182, "blush",    0.22,  0.00, 3],
      ["peony", -160,  -560, 196, "cream",    0.16, -0.14, 1],
      ["peony",  166,  -540, 198, "rose",     0.16,  0.16, 0],
      ["peony",    4,  -318, 190, "blush",    0.10,  0.02, 2],
    ],
    buds: [
      ["peony", -104, -1118, 50, "rose"],
      ["peony",  128, -1128, 54, "blush"],
      ["peony", -402,  -842, 46, "coral"],
      ["peony",  408,  -826, 48, "cream"],
    ],
    // the lowest start above the paper's edge, so the wrap stays in view; higher ones peek out
    // between and around the flowers
    leaves: [
      [ -60, -150, PI + 0.18, 290], [  64, -156, -0.16, 280],
      [ -70, -200, PI + 0.42, 250], [  72, -206, -0.44, 250],
      [ -46, -120, PI + 0.05, 230], [  48, -124, -0.04, 225],
      [ -70, -240, PI + 0.70, 220], [  72, -246, -0.72, 220],
      [-330, -520, PI + 0.10, 190], [ 336, -500, -0.06, 190],
      [-330, -800, PI + 0.55, 180], [ 336, -790, -0.55, 180],
      [-120, -1010, -1.95, 170],    [ 140, -1020, -1.20, 170],
      [-200, -250, PI - 0.20, 190], [ 204, -240, 0.18, 190],
    ],
  });
})(typeof window !== "undefined" ? window : globalThis);
