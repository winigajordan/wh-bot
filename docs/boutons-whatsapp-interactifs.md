# Boutons interactifs WhatsApp — mode livraison, confirmation, zones

Contexte : ajouter des messages interactifs WhatsApp (reply buttons + list message) à 3 endroits fixes et fermés du flow de commande, pour fluidifier le parcours et réduire l'ambiguïté sur les réponses libres (« Oui oui », « Livraison stp », variantes de quartier). Concerne les 3 points suivants, choisis parce que ce sont les seuls moments du flow avec un nombre fixe et fermé d'options :

1. **Mode de livraison** — 2 boutons : `Livraison` / `Retrait sur place`.
2. **Confirmation finale de commande** — 2 boutons : `Oui, je confirme` / `Non, je modifie`.
3. **Zone de livraison** — list message (menu déroulant), une ligne par zone active en base.

Le reste du flow (menu, panier, quantités, notes, adresse précise) reste en texte libre — pas de bouton, la variété des réponses possibles ne s'y prête pas.

## Principe d'architecture (important, à respecter strictement)

Pas de changement à `AiService` ni à `ClaudeService`/`GptService` — les boutons restent une couche purement WhatsApp/orchestrateur, invisible pour Claude et GPT. Le mécanisme :

- Le modèle continue d'utiliser les tools existants normalement (`get_delivery_zones`, `set_delivery_info`, `confirm_order`) — leur comportement métier (validation, calcul de frais, revalidation stricte) ne change pas.
- On ajoute 2 nouveaux tools **de présentation uniquement** (`ask_delivery_mode`, `ask_order_confirmation`), sans effet de bord métier, dont le rôle est de signaler à l'orchestrateur qu'un message interactif doit être envoyé à la place du texte.
- `get_delivery_zones` (tool existant) est légèrement enrichi : en plus de retourner les zones au modèle comme aujourd'hui, il signale aussi qu'un list message doit être envoyé.
- Après la boucle de tool calling, l'orchestrateur vérifie si un message interactif a été signalé pendant ce tour. Si oui, il envoie ce message interactif à la place du texte généré par le modèle. Sinon, comportement inchangé (texte normal via Send API).
- Quand le client clique sur un bouton ou une option de liste, WhatsApp renvoie un message de type `interactive` (pas `text`). On extrait le `title` du bouton/de la ligne cliquée et on le traite **exactement comme un message texte normal** du client (le titre du bouton devient le contenu du message utilisateur dans la session). Le modèle interprète ça avec les tools existants (`set_delivery_info`, `confirm_order`), sans changement de leur logique.

Ce choix garde tout le raisonnement métier (validation, revalidation stricte) dans les tools déjà testés, et n'ajoute qu'une couche de présentation.

## Phase 1 — Webhook : parser les réponses interactives

Dans `src/webhook/parse-whatsapp-webhook.util.ts` :

- Actuellement seuls les messages `type === 'text'` sont parsés, le reste est ignoré.
- Ajouter la prise en charge de `type === 'interactive'` avec `interactive.type === 'button_reply'` ou `interactive.type === 'list_reply'` :
  - `button_reply` → extraire `interactive.button_reply.title` (et `id` si utile pour du logging).
  - `list_reply` → extraire `interactive.list_reply.title`.
- Dans les deux cas, produire un `ParsedIncomingTextMessage` identique à celui d'un message texte classique, avec `text` = le `title` extrait. Le reste du pipeline (session, orchestrateur, Claude/GPT) ne voit aucune différence avec un message texte tapé par le client.
- Ajouter des tests dans `parse-whatsapp-webhook.util.spec.ts` pour `button_reply` et `list_reply` (payloads d'exemple à construire sur le modèle des payloads Meta réels).

## Phase 2 — WhatsappClientService : méthodes d'envoi interactif

Dans `src/whatsapp-client/whatsapp-client.service.ts`, ajouter :

- `sendInteractiveButtons(phoneNumberId, to, bodyText, buttons: { id: string; title: string }[])` — max 3 boutons, titre 20 caractères max (valider/tronquer si dépassement, logger un warning si troncature). Payload Graph API type `interactive` / `button`.
- `sendInteractiveList(phoneNumberId, to, bodyText, buttonLabel: string, rows: { id: string; title: string; description?: string }[])` — max 10 lignes, titre de ligne 24 caractères max, description 72 caractères max. Payload Graph API type `interactive` / `list`.
- Même style de gestion d'erreur que `sendTextMessage` existant : log l'erreur, ne jamais throw (Meta doit toujours recevoir 200 depuis le webhook).
- Tests `whatsapp-client.service.spec.ts` pour les deux nouvelles méthodes (mêmes patterns que les tests existants sur `sendTextMessage`).

## Phase 3 — Tools de présentation (ask_delivery_mode, ask_order_confirmation)

Dans `src/restaurant-ordering/tools/ordering.tools.ts` et `restaurant-ordering-tools.service.ts` :

- `ask_delivery_mode` : pas d'input. Exécution : ne fait aucune validation métier, se contente de préparer un payload interactif (body : « Souhaitez-vous une livraison ou un retrait sur place ? », boutons : `Livraison` / `Retrait sur place`) et de le stocker sur un état mutable du tool executor propre à ce tour de conversation (voir Phase 5). Retourne au modèle un résultat simple, ex. `{ presented: true }`.
- `ask_order_confirmation` : pas d'input. Exécution : récupère le récapitulatif actuel du panier (réutiliser la logique déjà existante de `get_cart_summary` / construction du récap avant `confirm_order`), prépare un payload interactif (body : le récapitulatif complet + total, boutons : `Oui, je confirme` / `Non, je modifie`), le stocke de la même façon. Retourne `{ presented: true }` au modèle.
- Ajouter ces deux tools à `ORDERING_TOOLS` (ordre figé existant — les ajouter à la fin de la liste actuelle pour ne pas perturber le breakpoint de prompt caching sur le dernier tool).
- Mettre à jour le prompt système (`BUSINESS_RULES`, partie flow de commande) : quand vient le moment de demander le mode de livraison, appeler `ask_delivery_mode` plutôt que de poser la question en texte libre ; quand vient le moment de demander confirmation finale, appeler `ask_order_confirmation` plutôt que de l'écrire en texte. Après l'appel de ces tools, le modèle ne doit pas reformuler la même question en texte (le bouton s'en charge) — un texte d'accompagnement court est acceptable mais pas obligatoire.

## Phase 4 — Enrichir get_delivery_zones (list message)

Dans `restaurant-ordering-tools.service.ts`, sur le tool existant `get_delivery_zones` :

- Ne pas changer les données retournées au modèle (zones + frais, comme aujourd'hui).
- En plus, préparer un payload de list message (body : « Voici nos zones de livraison, choisissez la vôtre » ou équivalent, une ligne par zone active avec le nom en titre et le frais en description, ex. titre `Fass`, description `Frais : 1 200 F`) et le stocker sur le même état mutable que Phase 3.
- Pas de nouveau tool ici — c'est un enrichissement du tool existant, le modèle continue de l'appeler exactement comme avant.

## Phase 5 — État mutable partagé du tour (interactive payload)

Dans `RestaurantOrderingToolsService` (qui implémente `AiToolExecutor`) :

- Ajouter un champ interne (réinitialisé au début de chaque tour de conversation, pas partagé entre conversations différentes — attention à l'isolation multi-tenant, une instance/scope par requête ou reset explicite en début de tour) qui stocke le dernier payload interactif préparé par un tool pendant ce tour (`{ type: 'buttons' | 'list', ... }` ou `null`).
- Une méthode `consumePendingInteractiveMessage()` qui retourne le payload et le réinitialise à `null` — appelée une seule fois par l'orchestrateur après la fin de la boucle de tool calling.
- Si plusieurs tools de présentation sont appelés dans le même tour (ne devrait pas arriver en usage normal), le dernier écrase le précédent — logger un warning si ce cas se présente, ne pas planter.

## Phase 6 — Branchement dans l'orchestrateur

Dans `ConversationOrchestratorService`, après avoir obtenu le texte final de `ai.generateReply()` (comportement actuel inchangé pour l'appel au modèle) :

- Appeler `toolExecutor.consumePendingInteractiveMessage()`.
- Si un payload est présent : envoyer via `WhatsappClientService.sendInteractiveButtons(...)` ou `sendInteractiveList(...)` selon le type, avec le `bodyText` du payload (pas le texte brut du modèle — le payload porte déjà le texte formaté pour le bouton/la liste). Stocker dans la session (`appendAssistantMessage`) une représentation textuelle simple de ce qui a été envoyé (ex. le `bodyText` + les libellés d'options entre parenthèses), pour que l'historique reste cohérent pour les prochains tours.
- Si aucun payload : comportement actuel inchangé, `sendTextMessage` avec le texte du modèle.

## Non fait (volontairement)

- Aucun changement à `AiService`, `ClaudeService`, `GptService` — les providers restent inconscients de l'existence des boutons.
- Aucun changement à la logique de validation métier dans `set_delivery_info`, `confirm_order`, `DeliveryZonesService` — les boutons ne remplacent pas la revalidation stricte existante, ils ne font qu'accélérer la saisie.
- Pas de mapping direct `button_id → action métier` sans repasser par le modèle (on garde le flow actuel : le clic redevient du texte, le modèle réinterprète normalement). Optimisation possible plus tard si on veut économiser un aller-retour modèle, hors scope ici.
- Pas de boutons sur le menu, les quantités, les notes, l'adresse précise — restent en texte libre.
- Pas de bouton pour l'écran Vision/dashboard — hors scope, ne concerne que le flow conversationnel WhatsApp.

## Tests à écrire/mettre à jour

- `parse-whatsapp-webhook.util.spec.ts` : cas `button_reply` et `list_reply`.
- `whatsapp-client.service.spec.ts` : `sendInteractiveButtons`, `sendInteractiveList`, y compris troncature de titres trop longs.
- `restaurant-ordering-tools.service.spec.ts` : `ask_delivery_mode`, `ask_order_confirmation`, et `get_delivery_zones` enrichi — vérifier que le payload interactif est bien stocké et que les données retournées au modèle ne changent pas.
- `conversation-orchestrator.service.spec.ts` : cas avec payload interactif présent (envoie interactive, pas texte) et cas sans (comportement inchangé).

## Validation attendue

- Conversation de test manuelle (ngrok) : commande complète menu → panier → clic sur bouton mode livraison → si livraison, clic sur une zone dans la liste → clic sur bouton de confirmation finale. Vérifier que `confirm_order` se déclenche correctement avec les bonnes données malgré les clics.
- Non-régression : un client qui répond en texte libre au lieu de cliquer (ex. tape « livraison » à la main) doit toujours fonctionner exactement comme avant — les tools `set_delivery_info`/`confirm_order` ne changent pas de comportement.
- `AI_PROVIDER=claude` et `AI_PROVIDER=openai` : les deux doivent déclencher les boutons de la même façon (comportement provider-agnostique confirmé).
- `npm run build`, tests verts.