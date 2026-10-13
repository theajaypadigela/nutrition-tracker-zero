/**
 * What the Worker calls the same food: a name lowercased, stripped of accents and punctuation, with its last word singular
 * ("Tomatoes" and "tomato", "Sandwiches" and "sandwich" are one food). The app uses the Worker's own function so that what it
 * offers, and what it calls "not found", can never disagree with what the Worker will accept: a name the Worker already has is a
 * 409 on save. It is a pure file the app bundles already (the on-device Worker is built from the same source).
 */
export { normalizeName } from '../../../worker/src/domain/normalize';
