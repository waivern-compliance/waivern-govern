/**
 * What this product is called.
 *
 * One place, because the name appears in a browser tab, a masthead, a sign-in
 * page, an exported spreadsheet's provenance header, an audit manifest handed
 * to a regulator, and the instructions given to a language model. A rename
 * that reached five of those and missed the sixth would leave a document
 * asserting it came from something that no longer exists.
 */

/** The full name, wherever it is written out. */
export const PRODUCT_NAME = "Waivern Governance Tool";

/**
 * The two halves, for the wordmark and anywhere the vendor is set apart from
 * the product. Kept derived from the name above so they cannot drift from it.
 */
export const PRODUCT_VENDOR = "Waivern";
export const PRODUCT_SUFFIX = PRODUCT_NAME.slice(PRODUCT_VENDOR.length).trim();

/** One line describing it, used in metadata and on the sign-in page. */
export const PRODUCT_DESCRIPTION = "Privacy and AI governance workflow";
