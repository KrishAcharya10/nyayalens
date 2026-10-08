// Default verb lexicon for obligation actions, ordered most specific first
// ("pay ... interest ... delay" before plain "pay"). Only actions a
// document's DomainPack declares are ever considered, and a pack can
// override any of these with ObligationTypeDescriptor.verbPattern.
export const DEFAULT_VERB_PATTERNS: Array<[action: string, pattern: RegExp]> = [
  ["PAY_DELAY_COMPENSATION", /\bpay\b[^.]*\binterest\b|\bcompensat/i],
  ["PAY_SALARY", /\bpay\b[^.]*\bsalary\b/i],
  ["PAY_TAXES", /\bpay all (?:property )?taxes|\bpay all land revenue|\btaxes, cesses/i],
  ["REFUND_DEPOSIT", /\b(?:refund|return)\b[^.]*\bdeposit\b/i],
  ["REFUND_ADVANCE", /\b(?:refund|return)\b[^.]*\badvance\b/i],
  ["REFUND", /\brefund\b/i],
  ["DELIVER_POSSESSION", /\b(?:hand over|deliver)\b[^.]{0,40}\bpossession\b/i],
  ["TAKE_POSSESSION", /\btake possession\b/i],
  ["RESTORE_POSSESSION", /\brestore vacant possession\b/i],
  ["VACATE", /\bhand (?:over|back) (?:vacant|the)\b|\bvacate\b/i],
  ["EXECUTE_SALE_DEED", /\bexecute\b[^.]*\bsale deed\b/i],
  ["CLEAR_ENCUMBRANCE", /\bclear the (?:said )?loan\b|\bno-dues\b/i],
  ["PRODUCE_TITLE_DOCUMENTS", /\btitle (?:documents|deeds)\b/i],
  ["INDEMNIFY", /\bindemnif/i],
  ["RECTIFY_DEFECTS", /\brectify\b/i],
  ["REGISTER", /\bregister(?:ed)?\b/i],
  ["MAINTAIN", /\brepairs?\b|\bmaintenance\b|\bupkeep\b|\bkeep the [^.]* clean\b/i],
  ["SERVE_NOTICE", /\b(?:give|serve)\b[^.]*\bnotice\b|\bnotice before\b/i],
  ["PROTECT_CONFIDENTIAL", /\bkeep confidential\b|\bin (?:strict )?confidence\b/i],
  ["RETURN_INFORMATION", /\breturn or destroy\b/i],
  ["ASSIGN_IP", /\bassign\b/i],
  ["JOIN", /\bjoin duty\b|\breport for duty\b/i],
  ["RETURN_PROPERTY", /\breturn all company property\b/i],
  ["REFRAIN_FROM_COMPETING", /\bnot take up employment with any competitor\b|\bnot compete\b/i],
  ["PROVIDE_SERVICES", /\bprovide the services\b/i],
  ["NOTIFY_BREACH", /\bnotify\b[^.]*\bbreach\b/i],
  ["USE_ONLY_FOR", /\bsolely for\b/i],
  ["PAY", /\bpa(?:y|id)\b|\bremit\b/i],
];
