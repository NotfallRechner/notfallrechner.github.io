// Local settings of the clinic. Edit this file to match your house standards;
// the app shows a warning in the pump calculator until `confirmed` is true.
(function (root) {
  'use strict';

  const CONFIG = {
    perfusor: {
      // Set to true once the list below matches the local pump standard.
      confirmed: false,
      // Standard syringes: active ingredient, amount in mg, total volume in ml
      // and the dose above which a warning appears (µg/kg/min).
      syringes: [
        { drug: 'Noradrenalin', mg: 5, ml: 50, maxDose: 1 },
        { drug: 'Noradrenalin', mg: 10, ml: 50, maxDose: 1 },
        { drug: 'Adrenalin', mg: 5, ml: 50, maxDose: 1 },
        { drug: 'Dobutamin', mg: 250, ml: 50, maxDose: 20 },
        { drug: 'Dopamin', mg: 250, ml: 50, maxDose: 20 },
      ],
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.NotfallConfig = CONFIG;
})(this);
