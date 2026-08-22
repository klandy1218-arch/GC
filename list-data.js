// Local-file fallback for browsers that block fetch("./list.json") on file:// pages.
// Keep this object synchronized with list.json.
window.GC_DATA = {
  "StatDefinitions": {
    "CHR": { "value": 3 },
    "CHD": { "value": 3 },
    "SPATK": { "value": 85 },
    "ATK": { "value": 40 },
    "MP": { "value": 4 },

    "CHR_2": { "value": 2 },
    "CHR_2_5": { "value": 2.5 },
    "CHR_3": { "value": 3 },

    "CHD_6": { "value": 6 },
    "CHD_8": { "value": 8 },
    "CHD_10": { "value": 10 },

    "ATK_150": { "value": 150 },
    "ATK_200": { "value": 200 },
    "ATK_300": { "value": 300 },
    "ATK_400": { "value": 400 },

    "SPATK_165": { "value": 165 },
    "SPATK_215": { "value": 215 },
    "SPATK_250": { "value": 250 },
    "SPATK_400": { "value": 400 },
    "SPATK_700": { "value": 700 },

    "MP_5": { "value": 5 }
  },
  "Equipment": {
    "HEAD": {
      "S5": ["CHR"],
      "S6": ["CHD"],
      "S7": ["CHD"],
      "S8": [],
      "S9": [],
      "S10": ["CHR"]
    },
    "BODY": {
      "S5": [],
      "S6": ["ATK"],
      "S7": ["CHD"],
      "S8": [],
      "S9": ["ATK", "CHR"],
      "S10": ["SPATK"]
    },
    "PANTS": {
      "S5": ["CHD"],
      "S6": [],
      "S7": [],
      "S8": ["MP"],
      "S9": ["SPATK"],
      "S10": ["SPATK"]
    },
    "GLOVES": {
      "S5": ["SPATK", "ATK"],
      "S6": ["ATK"],
      "S7": ["ATK"],
      "S8": ["CHR_HALF", "SPATK"],
      "S9": ["SPATK"],
      "S10": ["CHR_HALF", "ATK"]
    },
    "SHOES": {
      "S5": ["MP"],
      "S6": [],
      "S7": ["MP"],
      "S8": ["CHD"],
      "S9": ["MP", "ATK"],
      "S10": ["ATK"]
    },
    "CAPE": {
      "S5": ["ATK"],
      "S6": ["ATK", "CHR"],
      "S7": ["ATK", "CHR"],
      "S8": ["CHR"],
      "S9": [],
      "S10": ["MP", "CHD"]
    },
    "WEAPON": {
      "S5": ["CHD"],
      "S6": ["CHD"],
      "S7": ["CHR"],
      "S8": ["ATK"],
      "S9": ["SPATK", "CHD"],
      "S10": ["CHD"]
    },
    "HEAD_TOP": {
      "S5": [],
      "S6": ["SPATK", "MP"],
      "S7": ["MP"],
      "S8": ["MP"],
      "S9": ["ATK", "CHD"],
      "S10": ["ATK", "CHR"]
    },
    "HEAD_BOTTOM": {
      "S5": ["SPATK"],
      "S6": [],
      "S7": ["ATK"],
      "S8": ["ATK", "CHR"],
      "S9": ["ATK", "CHR"],
      "S10": ["SPATK", "CHD"]
    },
    "GARMENT_TOP": {
      "S5": ["ATK"],
      "S6": ["MP"],
      "S7": ["MP", "CHD"],
      "S8": [],
      "S9": ["MP", "CHD"],
      "S10": ["MP"]
    },
    "GARMENT_BOTTOM": {
      "S5": [],
      "S6": ["CHR", "SPATK"],
      "S7": ["ATK"],
      "S8": [],
      "S9": [],
      "S10": ["ATK", "CHD"]
    },
    "ACCESSORY": {
      "S5": ["CHR"],
      "S6": [],
      "S7": [],
      "S8": ["CHD"],
      "S9": [],
      "S10": ["CHR"]
    }
  },
  "SetBonus": {
    "S5": {
      "ST4": [],
      "ST8": ["SPATK_250"],
      "ST10": ["ATK_200"],
      "ST12": ["CHD_10"]
    },
    "S6": {
      "ST4": ["SPATK_165"],
      "ST8": ["ATK_150"],
      "ST10": ["CHD_8"],
      "ST12": []
    },
    "S7": {
      "ST4": ["SPATK_215"],
      "ST8": ["MP_5"],
      "ST10": ["ATK_400"],
      "ST12": ["CHR_3"]
    },
    "S8": {
      "ST4": ["CHD_6"],
      "ST8": [],
      "ST10": ["SPATK_700"],
      "ST12": ["CHR_3"]
    },
    "S9": {
      "ST4": ["ATK_300"],
      "ST8": ["SPATK_400"],
      "ST10": ["MP_5"],
      "ST12": ["CHD_10"]
    },
    "S10": {
      "ST4": ["CHR_2"],
      "ST8": ["MP_5"],
      "ST10": ["ATK_400"],
      "ST12": ["CHD_10"]
    }
  }
};
