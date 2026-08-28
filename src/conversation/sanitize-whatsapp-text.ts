/**
 * Nettoyage avant envoi WhatsApp (provider-agnostique).
 * - Titres Markdown (# …) en début de ligne
 * - Gras/italique/souligné WhatsApp (* … *, _ … _, ~ … ~) → texte brut
 * - Emojis de statut collés à « confirmé(e) »
 */
const STATUS_EMOJI_AFTER_CONFIRMED =
  /(confirmé(?:e)?)\s*[✅❌🎉]+/gi;

/** WhatsApp : *gras*, _italique_, ~barré~ — on garde le texte intérieur. */
const WHATSAPP_INLINE_FORMAT =
  /(\*|_|~)([^*_\n~]+)\1/g;

export function sanitizeWhatsappText(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let sanitized = line.replace(/^#{1,6}\s?/, '');
      sanitized = sanitized.replace(WHATSAPP_INLINE_FORMAT, '$2');
      sanitized = sanitized.replace(STATUS_EMOJI_AFTER_CONFIRMED, '$1');
      return sanitized;
    })
    .join('\n');
}
