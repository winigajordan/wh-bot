# Checklist — stabilisation bot WhatsApp

Tests manuels à faire avec ngrok + vrai numéro Meta avant pilote resto.

Prérequis : `npm run start:dev`, `ngrok http 3000`, seeds (`npm run seed`, `seed:menu`, `seed:zones`).

---

## UX WhatsApp

- [ ] Message lu (coches bleues) quasi immédiatement après envoi
- [ ] Indicateur « en train d'écrire… » pendant le traitement Claude (visible si > 2 s)
- [ ] Indicateur disparaît à l’arrivée de la réponse

## Debounce (rafales)

- [x] Envoyer **3 messages rapides** (< 3 s) → **1 seule** réponse, contexte des 3 messages
- [x] Envoyer un message, **attendre 6 s**, en envoyer un autre → **2** réponses distinctes
- [x] 2 numéros différents en parallèle → traitements indépendants

## Menu

- [x] « C’est quoi le menu ? » → liste réelle (pas inventée), prix cohérents avec seed
- [x] Demander une catégorie → filtre OK



## Panier

- [x] Ajouter 1 plat → confirmation avec nom + prix
- [x] Ajouter 2 plats différents → récap correct
- [x] Retirer 1 plat (`remove_from_cart`) → panier mis à jour
- [x] « Vide mon panier » → `clear_cart`, panier vide, livraison/note reset
- [x] Vider un panier déjà vide → message clair (pas d’erreur)



## Livraison

- [x] Quartier couvert → zone + frais affichés
- [x] Quartier inconnu → refus + proposition retrait
- [x] Retrait (pickup) → `delivery_fee = 0`



## Commande

- [x] Récap complet avant confirmation (items, mode, frais, total)
- [x] Confirmer explicitement → `CMD-XXXX` créé en base
- [x] `get_order_status` avec le numéro → statut correct
- [x] Après confirm → panier Redis vidé



## Robustesse

- [x] Commande multi-plats + livraison → pas de silence (limite tools + fallback)
- [x] Id plat inventé → refus propre, bot répond quand même
- [x] Business inactif / inconnu → pas de crash webhook



## Logs à surveiller

- Pas de `Planification conversation échouée`
- `Send API OK` après chaque traitement debounce
- `Boucle tools Claude : limite atteinte` acceptable si suivi d’un `Send API OK` (fallback)

