/**
 * Only implement with explicit provider authorization, their official API/SDK,
 * or a directly authorized merchant system.
 * Return null when unconnected. Never synthesize amounts or availability.
 *
 * For an available provider:
 * {provider, status:'available', currency:'JPY', source:'official_partner_api'|'merchant_api',
 *  subtotal:integer, deliveryFee:integer, serviceFee:integer, otherFees:integer,
 *  discount:integer, total:integer, checkedAt:ISO-8601, menuMatched:true, orderUrl?:HTTPS_URL}
 * For an affirmative "cannot deliver" answer:
 * {provider, status:'unavailable', source:'official_partner_api'|'merchant_api', checkedAt:ISO-8601}
 */
export async function getAuthorizedQuote(provider, request) {
  // TODO: implement after contracts/API permissions are in place.
  // Provider identifiers: direct, demae, uber, rocket.
  // request carries deliveryAddress and items. Do not log or store them.
  return null;
}
