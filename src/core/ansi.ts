// ANSI stripping inlined from strip-ansi@7.2.0 / ansi-regex@6.2.2
// (MIT, Sindre Sorhus) to keep token-killer truly dependency-free. The pattern
// is frozen from ansi-regex; the escape grammar (CSI/OSC) is a stable spec.
// If coverage ever needs widening, re-sync against chalk/ansi-regex.
//
// The pattern uses only bounded quantifiers ⇒ linear-time matching, no ReDoS.
const ANSI_PATTERN = new RegExp("(?:\\u001B\\][\\s\\S]*?(?:\\u0007|\\u001B\\u005C|\\u009C))|[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]", "g");

// 7-bit ESC (U+001B) and 8-bit CSI (U+009B) introducers — every ANSI escape
// begins with one of them, so we skip the regex entirely when neither appears.
const ESC = String.fromCharCode(0x1b);
const CSI = String.fromCharCode(0x9b);

export function removeAnsi(text: string): string {
  if (!text.includes(ESC) && !text.includes(CSI)) {
    return text;
  }
  return text.replace(ANSI_PATTERN, "");
}
