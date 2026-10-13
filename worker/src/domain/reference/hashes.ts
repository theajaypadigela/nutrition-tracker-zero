/**
 * The hashes a test pins: change a number in a reference table and its hash changes, so every edit shows up in review (plan 11.3).
 * They live here, not in the tables' own files, so both reference sets can be hashed without the files importing each other.
 */
import {
  AMDR,
  CARB_RDA_G,
  EER_COEFFICIENTS,
  EER_STANDARD_ERROR,
  ENERGY_LIMIT_SHARE,
  FAT_DEFAULT_SHARE,
  FAT_MIN_SHARE,
  FIBRE_FLOOR_G,
  FIBRE_G_PER_1000_KCAL,
  GENERIC_BAND,
  GENERIC_ENERGY_KCAL,
  GENERIC_LABEL_VALUES,
  NASEM_MICROS,
  PAL_TABLE_7_1,
  PROTEIN_MAX_G_PER_KG,
  PROTEIN_RDA_G_PER_KG,
  SODIUM_AI_MG,
  SODIUM_LIMIT_MG,
  SODIUM_LIMIT_WHO_MG,
  fnv1a,
  stableStringify,
} from './nasem';
import {
  ICMR_ADDED_SUGAR_SHARE,
  ICMR_AMDR,
  ICMR_FIBRE_G_PER_1000_KCAL,
  ICMR_MICROS,
  ICMR_POTASSIUM_MG,
  ICMR_PROTEIN_RDA_G_PER_KG,
  ICMR_SODIUM_LIMIT_MG,
} from './icmr';

export function tableHashes(): Record<string, string> {
  return {
    micros: fnv1a(stableStringify(NASEM_MICROS)),
    eer: fnv1a(stableStringify({ EER_COEFFICIENTS, EER_STANDARD_ERROR, PAL_TABLE_7_1 })),
    macros: fnv1a(
      stableStringify({
        AMDR,
        PROTEIN_RDA_G_PER_KG,
        PROTEIN_MAX_G_PER_KG,
        CARB_RDA_G,
        FIBRE_G_PER_1000_KCAL,
        FIBRE_FLOOR_G,
        FAT_DEFAULT_SHARE,
        FAT_MIN_SHARE,
        SODIUM_LIMIT_MG,
        SODIUM_LIMIT_WHO_MG,
        SODIUM_AI_MG,
      }),
    ),
    generic: fnv1a(stableStringify({ GENERIC_ENERGY_KCAL, GENERIC_LABEL_VALUES, GENERIC_BAND, ENERGY_LIMIT_SHARE })),
    icmr: fnv1a(
      stableStringify({
        ICMR_MICROS,
        ICMR_AMDR,
        ICMR_PROTEIN_RDA_G_PER_KG,
        ICMR_FIBRE_G_PER_1000_KCAL,
        ICMR_SODIUM_LIMIT_MG,
        ICMR_POTASSIUM_MG,
        ICMR_ADDED_SUGAR_SHARE,
      }),
    ),
  };
}
