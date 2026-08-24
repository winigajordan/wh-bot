import { ClaudeToolDefinition } from '../../module-registry/module-definition';
import { GET_MENU_TOOL } from './get-menu.tool';

export const ADD_TO_CART_TOOL: ClaudeToolDefinition = {
  name: 'add_to_cart',
  description:
    'Ajoute un plat au panier. item_id doit être l’UUID exact renvoyé par get_menu (champ id) — ne jamais inventer un identifiant.',
  input_schema: {
    type: 'object',
    properties: {
      item_id: { type: 'string', description: 'UUID du plat' },
      quantity: { type: 'integer', description: 'Quantité (>= 1)' },
      options: {
        type: 'array',
        items: { type: 'string' },
        description: 'Options/suppléments optionnels',
      },
    },
    required: ['item_id', 'quantity'],
  },
};

export const REMOVE_FROM_CART_TOOL: ClaudeToolDefinition = {
  name: 'remove_from_cart',
  description: 'Retire un plat du panier.',
  input_schema: {
    type: 'object',
    properties: {
      item_id: { type: 'string', description: 'UUID du plat à retirer' },
    },
    required: ['item_id'],
  },
};

export const CLEAR_CART_TOOL: ClaudeToolDefinition = {
  name: 'clear_cart',
  description:
    'Vide entièrement le panier (items, livraison et note en cours). À utiliser si le client veut recommencer ou annuler sa commande en cours.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const GET_CART_SUMMARY_TOOL: ClaudeToolDefinition = {
  name: 'get_cart_summary',
  description:
    'Affiche le panier : items, subtotal, delivery_fee (0 en retrait), total, order_note.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const GET_DELIVERY_ZONES_TOOL: ClaudeToolDefinition = {
  name: 'get_delivery_zones',
  description:
    'Liste les quartiers livrables avec leurs frais de livraison (delivery_fee).',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export const SET_DELIVERY_INFO_TOOL: ClaudeToolDefinition = {
  name: 'set_delivery_info',
  description:
    'Enregistre le mode livraison ou retrait. address_text requis si mode=delivery.',
  input_schema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['delivery', 'pickup'] },
      address_text: {
        type: 'string',
        description: 'Adresse ou quartier du client (requis en livraison)',
      },
    },
    required: ['mode'],
  },
};

export const SET_ORDER_NOTE_TOOL: ClaudeToolDefinition = {
  name: 'set_order_note',
  description:
    'Enregistre une note pour la commande si le client en fournit une (allergies, instructions cuisine, etc.).',
  input_schema: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'Texte de la note fournie par le client.',
      },
    },
    required: ['note'],
  },
};

export const CONFIRM_ORDER_TOOL: ClaudeToolDefinition = {
  name: 'confirm_order',
  description:
    'Confirme la commande après récapitulatif et accord explicite du client. confirmed_by_client doit être true.',
  input_schema: {
    type: 'object',
    properties: {
      confirmed_by_client: {
        type: 'boolean',
        description: 'true seulement si le client a confirmé explicitement',
      },
    },
    required: ['confirmed_by_client'],
  },
};

export const GET_ORDER_STATUS_TOOL: ClaudeToolDefinition = {
  name: 'get_order_status',
  description: 'Récupère le statut d’une commande par son numéro.',
  input_schema: {
    type: 'object',
    properties: {
      order_number: { type: 'string', description: 'Ex. CMD-0001' },
    },
    required: ['order_number'],
  },
};

export const ORDERING_TOOLS: ClaudeToolDefinition[] = [
  GET_MENU_TOOL,
  ADD_TO_CART_TOOL,
  REMOVE_FROM_CART_TOOL,
  CLEAR_CART_TOOL,
  GET_CART_SUMMARY_TOOL,
  GET_DELIVERY_ZONES_TOOL,
  SET_DELIVERY_INFO_TOOL,
  SET_ORDER_NOTE_TOOL,
  CONFIRM_ORDER_TOOL,
  GET_ORDER_STATUS_TOOL,
];
