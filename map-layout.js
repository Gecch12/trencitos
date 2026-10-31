"use strict";

// Presentation only: city IDs and route IDs continue to come from data.js.
// The schematic geography is hand composed; no commercial artwork is embedded.
const RailMap = (() => {
  const bounds = { x: -60, y: -10, width: 980, height: 660 };
  const tile = { width: 22, height: 8.5, gap: 3.5, cityMargin: 9, parallel: 13 };
  const cities = {
    EDI: [126, 64], LON: [176, 199], DIE: [171, 270], BRE: [82, 297],
    PAR: [213, 307], PAM: [158, 437], MAD: [84, 499], LIS: [-7, 527],
    CAD: [88, 585], BAR: [175, 532], AMS: [256, 200], BRU: [244, 239],
    ESS: [330, 204], FRA: [320, 270], MUN: [371, 320], ZUR: [300, 365],
    MAR: [287, 452], VEN: [386, 399], ROM: [404, 472], BRI: [489, 495],
    PAL: [426, 580], STO: [471, 46], COP: [390, 123], BER: [415, 221],
    VIE: [463, 333], BUD: [515, 354], ZAG: [458, 410], SAR: [525, 451],
    SOF: [586, 477], ATH: [571, 563], RIG: [580, 81], DAN: [514, 154],
    WIL: [651, 192], WAR: [553, 224], BUC: [645, 416], CON: [691, 524],
    ANG: [754, 572], SMY: [654, 594], PET: [723, 65], MOS: [811, 181],
    SMO: [742, 205], KIE: [689, 272], KHA: [807, 315], ROS: [841, 368],
    SEV: [758, 434], SOC: [836, 452], ERZ: [824, 564],
  };
  // Intermediate points describe the route, not extra stations or junctions.
  const bends = {
    "EDI-LON": [[151, 131]], "LON-DIE": [[175, 235]],
    "DIE-BRE": [[128, 278]], "DIE-BRU": [[200, 270], [216, 243]], "BRE-PAR": [[146, 304]],
    "BRE-PAM": [[125, 344], [137, 398]],
    "PAR-FRA": [[266, 307], [298, 292]], "PAR-ZUR": [[245, 343], [269, 363]],
    "PAR-MAR": [[238, 376], [268, 420]], "PAR-PAM": [[197, 366], [178, 409]],
    "PAM-MAR": [[218, 429], [250, 449]], "PAM-BAR": [[161, 482]],
    "PAM-MAD": [[122, 468]], "MAD-LIS": [[43, 493], [9, 502]],
    "LIS-CAD": [[24, 571], [57, 582]], "CAD-MAD": [[102, 548]],
    "MAD-BAR": [[126, 528]], "BAR-MAR": [[232, 499]],
    "AMS-ESS": [[277, 169], [310, 177]], "AMS-FRA": [[283, 231]],
    "ESS-COP": [[358, 164]], "ESS-BER": [[365, 212], [393, 202]],
    "FRA-BER": [[369, 249]], "FRA-MUN": [[332, 305], [353, 306]],
    "MUN-VIE": [[405, 344], [437, 344]], "MUN-ZUR": [[336, 344]],
    "ZUR-VEN": [[340, 387]], "ZUR-MAR": [[292, 410]],
    "MAR-ROM": [[338, 424], [370, 446]], "VEN-ZAG": [[420, 391]],
    "ROM-BRI": [[441, 462], [465, 482]], "ROM-PAL": [[436, 513], [430, 549]],
    "BRI-ATH": [[506, 548], [541, 565]], "BRI-PAL": [[481, 541], [475, 567]],
    "PAL-SMY": [[529, 602], [606, 604]],
    "STO-PET": [[541, 34], [626, 34], [686, 43]], "STO-COP": [[427, 89]],
    "BER-DAN": [[435, 166], [462, 145], [490, 146]],
    "BER-WAR": [[481, 205]], "VIE-WAR": [[512, 287]],
    "BUD-KIE": [[576, 303], [635, 300]], "BUD-BUC": [[573, 380], [610, 395]],
    "BUD-SAR": [[524, 402]], "ZAG-SAR": [[477, 450], [502, 462]],
    "SAR-ATH": [[526, 510], [547, 548]], "SOF-BUC": [[617, 464]],
    "SOF-ATH": [[562, 514], [561, 543]], "ATH-SMY": [[613, 574]],
    "RIG-PET": [[648, 81]], "RIG-WIL": [[591, 126], [633, 150]],
    "RIG-DAN": [[546, 109], [532, 134]], "DAN-WAR": [[542, 177]],
    "WIL-SMO": [[694, 187], [719, 195]], "WIL-KIE": [[675, 229]],
    "WIL-WAR": [[608, 176], [575, 193]], "WAR-KIE": [[599, 257], [644, 264]],
    "BUC-SEV": [[686, 384], [721, 399]], "CON-SEV": [[741, 488]],
    "CON-SMY": [[671, 555]], "ANG-ERZ": [[781, 603], [812, 595]],
    "ANG-SMY": [[710, 604]], "PET-MOS": [[780, 100], [808, 139]],
    "MOS-KHA": [[838, 235], [839, 274]], "SMO-KIE": [[733, 243], [713, 267]],
    "KIE-KHA": [[733, 314], [775, 328]], "KHA-ROS": [[841, 323]],
    "ROS-SEV": [[797, 369], [782, 404]], "SEV-ERZ": [[775, 484], [806, 529]],
  };
  // Preferred offsets are screen pixels, independent of the map camera.
  const labels = {
    EDI: [-10, -14, "end"], LON: [-12, -3, "end"], DIE: [0, 19, "middle"],
    BRE: [-13, 4, "end"], PAR: [-10, 20, "end"], PAM: [-12, -5, "end"],
    MAD: [-3, -15, "middle"], LIS: [0, 20, "middle"], CAD: [0, 20, "middle"],
    BAR: [7, 20, "start"], AMS: [-3, -14, "middle"], BRU: [-10, -9, "end"],
    ESS: [-7, 21, "end"], FRA: [9, 22, "start"], MUN: [6, -14, "start"],
    ZUR: [-10, -6, "end"], MAR: [1, 21, "middle"], VEN: [8, -13, "start"],
    ROM: [-12, 3, "end"], BRI: [7, -15, "start"], PAL: [-10, 19, "end"],
    STO: [-7, -15, "end"], COP: [-12, -5, "end"], BER: [-2, 22, "middle"],
    VIE: [3, -15, "start"], BUD: [7, -15, "start"], ZAG: [-10, 22, "end"],
    SAR: [8, -13, "start"], SOF: [-10, -4, "end"], ATH: [0, -15, "middle"],
    RIG: [9, 19, "start"], DAN: [-7, 20, "end"], WIL: [-4, 21, "end"],
    WAR: [8, 19, "start"], BUC: [-5, -15, "end"], CON: [-12, -8, "end"],
    ANG: [0, -15, "middle"], SMY: [0, 20, "middle"], PET: [8, -11, "start"],
    MOS: [-9, -12, "end"], SMO: [0, 21, "middle"], KIE: [12, 2, "start"],
    KHA: [-9, -14, "end"], ROS: [-12, 2, "end"], SEV: [-8, -15, "end"],
    SOC: [12, 2, "start"], ERZ: [0, -15, "middle"],
  };
  const land = [
    // Mainland, including Iberia, Italy and the Balkan peninsula.
    "M65 282 C102 272 143 275 174 254 L196 241 230 225 Q239 206 250 190 L289 178 338 165 350 126 Q355 110 365 115 L374 139 370 165 392 174 Q445 155 487 170 L516 174 549 158 557 120 575 98 607 79 633 53 679 36 Q723 18 765 29 L819 74 Q850 107 856 145 L868 197 861 259 874 330 866 395 853 466 Q839 462 823 447 L802 433 784 438 763 425 748 430 737 442 727 421 746 411 Q720 393 694 410 L679 429 674 459 682 492 700 511 690 526 655 523 625 520 604 538 612 558 594 557 601 579 583 575 576 589 562 574 550 540 534 519 519 513 508 488 489 461 467 439 433 419 419 428 Q428 449 456 469 L479 476 501 494 505 513 491 519 480 510 476 538 464 551 453 536 458 521 438 505 423 492 409 468 395 449 378 433 355 423 Q331 413 318 433 L296 463 Q277 475 254 460 L231 464 214 479 201 505 183 543 158 553 134 582 106 600 Q71 614 28 602 L1 580 -25 561 Q-35 530 -20 506 L2 486 46 471 87 463 127 456 151 444 169 419 171 392 161 370 169 340 154 326 119 320 95 312 65 299Z",
    // Great Britain, separated from France by the Channel.
    "M87 20 L112 14 142 25 151 47 147 72 157 92 147 105 167 130 178 151 183 181 191 202 172 215 146 219 128 208 105 212 111 194 132 179 119 165 111 141 96 125 103 102 86 92 95 71 77 55Z",
    "M44 69 Q67 63 78 82 L70 107 80 127 68 150 58 178 34 186 25 166 35 140 27 122 37 101Z",
    // Scandinavia and the Danish islands.
    "M331 80 Q336 46 361 24 L391 11 443 12 480 17 507 26 517 46 498 64 483 61 459 77 442 100 421 109 408 103 398 89 382 95 366 101 352 101 349 88Z",
    "M382 113 L397 117 402 130 388 140 376 129Z",
    // Anatolia, with the Black Sea left open above it.
    "M686 533 L710 524 723 509 745 500 767 494 803 488 832 488 854 505 865 542 852 585 829 604 786 613 754 601 707 608 669 617 643 606 644 580 654 557 676 547Z",
    "M394 571 Q417 564 447 569 L437 589 413 599 400 587Z",
    "M321 454 L332 450 336 468 328 484 319 475Z",
    "M320 505 L336 501 344 529 334 550 317 542 313 522Z",
  ];
  const details = [
    "M176 434 Q220 437 268 452", "M206 280 Q271 286 293 327 T342 362",
    "M344 187 Q351 242 380 270 T422 318", "M438 185 Q471 250 498 288",
    "M301 379 Q341 365 381 382", "M459 426 Q488 433 508 475",
    "M583 204 Q610 255 610 303 T644 378", "M724 502 Q755 543 802 549",
  ];
  const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function spline(points) {
    const samples = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i];
      const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      const steps = Math.max(12, Math.ceil((distance(p1, c1) + distance(c1, c2) + distance(c2, p2)) / 1.5));
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, u = 1 - t;
        samples.push([0, 1].map(k => u ** 3 * p1[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t ** 3 * p2[k]));
      }
    }
    return samples;
  }
  function measured(points) {
    const lengths = [0];
    for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
    return { points, lengths, length: lengths.at(-1) };
  }
  function pointAt(path, length) {
    length = Math.max(0, Math.min(path.length, length));
    let lo = 1, hi = path.lengths.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (path.lengths[mid] < length) lo = mid + 1;
      else hi = mid;
    }
    const span = path.lengths[lo] - path.lengths[lo - 1];
    return mix(path.points[lo - 1], path.points[lo], span ? (length - path.lengths[lo - 1]) / span : 0);
  }
  function toPath(points) {
    return points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join(" ");
  }
  function routeGeometry(route, lane = 0) {
    const a = cities[route.a], b = cities[route.b];
    const key = `${route.a}-${route.b}`, reverse = `${route.b}-${route.a}`;
    const middle = bends[key] || (bends[reverse] ? [...bends[reverse]].reverse() : []);
    let path = measured(spline([a, ...middle, b]));
    const minimum = route.n * tile.width + (route.n - 1) * tile.gap + 2 * tile.cityMargin;
    if (path.length < minimum) throw new Error(`Route ${key} is too short for uniform train slots (${path.length.toFixed(1)} < ${minimum})`);
    if (lane) {
      path = measured(path.points.map((p, i, ps) => {
        const prev = ps[Math.max(0, i - 1)], next = ps[Math.min(ps.length - 1, i + 1)];
        const d = distance(prev, next) || 1;
        // Taper only the city approaches; parallel train slots stay separated.
        const taper = Math.min(1, path.lengths[i] / 12, (path.length - path.lengths[i]) / 12);
        return [p[0] - (next[1] - prev[1]) / d * lane * taper, p[1] + (next[0] - prev[0]) / d * lane * taper];
      }));
    }
    const gap = route.n > 1 ? Math.max(tile.gap, Math.min(6, (path.length - 36 - route.n * tile.width) / (route.n - 1))) : 0;
    const span = route.n * tile.width + (route.n - 1) * gap;
    const margin = (path.length - span) / 2;
    const cells = Array.from({ length: route.n }, (_, i) => {
      const at = margin + tile.width / 2 + i * (tile.width + gap);
      const [x, y] = pointAt(path, at), p = pointAt(path, at - 0.5), q = pointAt(path, at + 0.5);
      return { x, y, angle: Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI, width: tile.width, height: tile.height, at };
    });
    return { id: route.id, ...path, d: toPath(path.points), cells, margin, gap };
  }
  function createNetwork(routes) {
    const pairs = new Map();
    for (const r of routes) {
      const key = [r.a, r.b].sort().join("-");
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(r);
    }
    return routes.map(r => {
      const pair = pairs.get([r.a, r.b].sort().join("-"));
      const direction = r.a === pair[0].a ? 1 : -1;
      const lane = (pair.indexOf(r) - (pair.length - 1) / 2) * tile.parallel * direction;
      return routeGeometry(r, lane);
    });
  }
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  function placeLabels(entries, width, height, tracks = [], metrics = { height: 15, baseline: 11 }) {
    const placed = [];
    // Give the crowded central cities first choice, with a stable tie break.
    const ordered = [...entries].sort((a, b) => {
      const density = p => entries.filter(q => Math.hypot(p.x - q.x, p.y - q.y) < 90).length;
      return density(b) - density(a) || a.key.localeCompare(b.key);
    });
    for (const city of ordered) {
      const candidates = [labels[city.key] || [0, -14, "middle"]];
      for (const gap of [14, 24, 36, 50]) candidates.push(
        [0, -gap, "middle"], [0, gap + 8, "middle"],
        [gap, 4, "start"], [-gap, 4, "end"],
        [gap, -gap, "start"], [-gap, -gap, "end"],
        [gap, gap + 8, "start"], [-gap, gap + 8, "end"],
      );
      let best = null;
      candidates.forEach(([dx, dy, anchor], i) => {
        const box = { x: city.x + dx - city.width * (anchor === "end" ? 1 : anchor === "middle" ? 0.5 : 0), y: city.y + dy - metrics.baseline, width: city.width, height: metrics.height };
        const padded = { x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 };
        const outside = box.width * box.height - overlap(box, { x: 4, y: 4, width: width - 8, height: height - 8 });
        let score = i * 1.2 + Math.hypot(dx, dy) * 1.2 + outside * 300;
        for (const other of placed) score += overlap(padded, other) * 200;
        for (const other of entries) score += overlap(padded, { x: other.x - 6, y: other.y - 6, width: 12, height: 12 }) * 40;
        for (const track of tracks) score += overlap(padded, track) * 0.07;
        if (!best || score < best.score) best = { ...box, key: city.key, score };
      });
      placed.push(best);
    }
    return placed;
  }
  return { bounds, tile, cities, bends, labels, land, details, createNetwork, pointAt, placeLabels };
})();
if (typeof module !== "undefined") module.exports = RailMap;
