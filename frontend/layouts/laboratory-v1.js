"use strict";

const LaboratoryLayoutV1 = {
  "mapRef": {
    "id": "laboratory",
    "version": "1"
  },
  "bounds": {
    "x": -60,
    "y": -80,
    "width": 1100,
    "height": 900
  },
  "tile": {
    "width": 22,
    "height": 8.5,
    "gap": 3.5,
    "cityMargin": 9,
    "parallel": 13
  },
  "cities": {
    "L01": [
      100,
      100
    ],
    "L02": [
      360,
      100
    ],
    "L03": [
      620,
      100
    ],
    "L04": [
      880,
      100
    ],
    "L05": [
      100,
      370
    ],
    "L06": [
      360,
      370
    ],
    "L07": [
      620,
      370
    ],
    "L08": [
      880,
      370
    ],
    "L09": [
      100,
      640
    ],
    "L10": [
      360,
      640
    ],
    "L11": [
      620,
      640
    ],
    "L12": [
      880,
      640
    ]
  },
  "bends": {
    "L01-L04": [
      [
        270,
        0
      ],
      [
        710,
        0
      ]
    ],
    "L09-L12": [
      [
        270,
        740
      ],
      [
        710,
        740
      ]
    ],
    "L01-L09": [
      [
        0,
        250
      ],
      [
        0,
        490
      ]
    ],
    "L04-L12": [
      [
        980,
        250
      ],
      [
        980,
        490
      ]
    ]
  },
  "labels": {},
  "land": [
    "M-30 -50H1010V790H-30Z"
  ],
  "details": [],
  "seaLabels": []
};
if (typeof module !== "undefined") module.exports = LaboratoryLayoutV1;
