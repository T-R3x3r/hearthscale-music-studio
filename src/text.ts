/** The text with its first letter in capitals, as a label or a sentence starts. */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
