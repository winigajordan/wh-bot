import { ClaudeToolDefinition } from '../../module-registry/module-definition';

export const ASK_DELIVERY_MODE_TOOL: ClaudeToolDefinition = {
  name: 'ask_delivery_mode',
  description:
    'Présente au client deux boutons WhatsApp : Livraison / Retrait sur place. Appeler quand le panier est prêt et qu’il faut choisir le mode — ne pas poser la question en texte libre. Après l’appel, ne pas reformuler la même question (les boutons s’en chargent).',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const ASK_ORDER_CONFIRMATION_TOOL: ClaudeToolDefinition = {
  name: 'ask_order_confirmation',
  description:
    'Présente le récapitulatif complet du panier avec deux boutons WhatsApp : Oui, je confirme / Non, je modifie. Appeler juste avant confirm_order quand le client doit valider — ne pas réécrire le récap en texte libre. Après l’appel, ne pas redemander confirmation en texte (les boutons s’en chargent).',
  input_schema: {
    type: 'object',
    properties: {},
  },
};
