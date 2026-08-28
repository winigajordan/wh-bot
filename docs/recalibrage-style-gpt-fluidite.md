# Recalibrage STYLE_OVERRIDES.openai — fluidité conversationnelle

Contexte : après la première version de `STYLE_OVERRIDES.openai` (règles anti-Markdown/anti-`#`), le formatage est propre mais le ton reste mécanique — CMD-0015 montre que GPT re-affiche le récapitulatif complet du panier à chaque micro-étape (ajout panier → mode livraison → adresse → confirmation), au lieu de ne le faire qu'une fois avant la confirmation finale, comme le fait Claude. Les puces ne posent pas de problème et doivent rester autorisées. Le problème est la répétition du récap et l'absence de réaction naturelle aux messages du client.

Cette tâche ne touche que le contenu de `STYLE_OVERRIDES.openai` dans `restaurant-ordering.module-definition.ts`, et éventuellement une petite extension du sanitizer. Aucune autre partie du code n'est concernée.

## Ce qui ne change pas

- `DEFAULT_STYLE_DIRECTIVES` (Claude) reste identique — aucune régression.
- Les règles métier partagées (`BUSINESS_RULES`) restent identiques.
- Le mécanisme d'override par provider reste le même (juste le contenu du texte qui change).

## Principe directeur (important, à formuler clairement dans le prompt)

En dehors de l'affichage du menu (qui reste structuré, catégories + items), **le choix entre une liste et une phrase en prose est laissé au jugement du modèle**, au cas par cas, selon ce qui rend le message le plus clair et agréable à lire. Ne pas imposer de règle fixe du type "toujours en liste pour X" ou "jamais de liste pour Y" — que ce soit pour les zones de livraison, les confirmations de panier, ou toute autre situation. L'objectif est la fluidité de lecture, pas un format uniforme.

## Réécriture de STYLE_OVERRIDES.openai

Remplacer le texte actuel par une version qui ajoute, en plus des règles anti-Markdown déjà en place (`#`, titres — celles-là restent, elles fonctionnent) :

1. **Éviter de répéter des informations déjà données si rien n'a changé dessus.** Après un ajout au panier, une confirmation courte suffit ("Noté, le makanek en sandwich est ajouté") — pas besoin de relister tout le panier avec tous les prix à chaque micro-étape suivante (choix du mode de livraison, adresse, etc.) si ces informations n'ont pas changé. Pas de règle fixe sur "à quel moment précis" un récapitulatif complet doit apparaître — c'est au modèle de juger, selon le contexte de la conversation, quand un rappel structuré (en liste ou en prose, au choix) apporte de la clarté et quand il est redondant. Le seul principe : ne pas répéter par réflexe ce que le client sait déjà.

2. **Réagir à ce que le client vient d'écrire, pas répéter un gabarit figé.** Éviter les formulations qui recommencent systématiquement de la même façon ("X enregistrée :", "Y ajouté :") à chaque tour. Varier la formulation comme le ferait une personne qui répond à un message, pas un système qui accuse réception.

3. **Gras réservé à l'essentiel.** Un seul élément en gras par message maximum dans les échanges intermédiaires (par exemple juste le total, si mentionné) — pas chaque prix d'une liste. Le récapitulatif final peut avoir un peu plus de gras (le total, éventuellement le numéro de commande) mais pas systématiquement sur chaque ligne.

4. **Pas d'emoji de statut** (✅, ❌, 🎉 ou similaire) sauf si le ton général du message en contient déjà un naturellement — pas de règle qui associe automatiquement un emoji à "commande confirmée".

## Ajouter un exemple few-shot dans le prompt

En plus des règles énoncées, ajouter un court exemple concret dans `STYLE_OVERRIDES.openai` — un modèle suit souvent mieux un exemple qu'une règle abstraite. Cet exemple illustre le principe (éviter la redondance, garder un ton naturel), ce n'est pas un gabarit à reproduire mécaniquement à chaque fois — le modèle garde la liberté de structurer différemment selon le contexte. Structure suggérée à inclure textuellement dans le prompt :

```
Exemple de ce qu'il NE FAUT PAS faire (trop de répétition et de gras) :
Client : "Livraison à Médina"
Mauvaise réponse : "Adresse enregistrée : *Médina*. Votre panier contient : Makanek en sandwich — 2 500 F, Salade César — 5 500 F, Frais de livraison — 1 500 F. *Total : 9 500 F*. Confirmez-vous la commande ?"

Exemple de ce qu'il FAUT faire (court, naturel, garde le récap complet pour la fin) :
Client : "Livraison à Médina"
Bonne réponse : "Parfait, livraison à Médina, ça fait 1 500 F de frais. Voici le récap avant de valider : makanek en sandwich, salade César, livraison à Médina. Total : 9 500 F. Je confirme ?"
```

Adapter les montants/items de l'exemple si besoin pour qu'ils restent cohérents avec le style neutre du prompt (ne pas coller un vrai nom de client ou une vraie commande passée).

## Sanitizer — extension légère

Dans `sanitizeWhatsappText()` : ajouter le retrait des emojis de statut isolés en fin de ligne (✅, ❌, 🎉) s'ils apparaissent immédiatement après un texte type "confirmé"/"confirmée" — filet de sécurité minimal, ne pas sur-complexifier (pas besoin de détecter tous les emojis possibles, juste ce pattern observé).

## Non fait (volontairement)

- Aucune interdiction des puces.
- Aucune modification de `DEFAULT_STYLE_DIRECTIVES` (Claude).
- Aucune modification des règles métier.
- Pas de limitation stricte du nombre de tours de conversation.

## Tests à mettre à jour

- `restaurant-ordering.module-definition.spec.ts` : vérifier que `STYLE_OVERRIDES.openai` contient bien l'exemple few-shot et les nouvelles consignes (test de présence de texte, pas de test comportemental — le comportement réel du modèle se valide manuellement).
- `sanitize-whatsapp-text.spec.ts` : ajouter un cas avec emoji de statut en fin de ligne après "confirmée".

## Validation attendue

- Reprendre une conversation de test équivalente à CMD-0015 (menu → panier 2 items → livraison → adresse → confirmation) avec `AI_PROVIDER=openai`, et vérifier :
  - Les informations déjà connues (prix, items) ne sont plus répétées par réflexe à chaque micro-étape.
  - Le format (liste ou prose) varie naturellement selon le contexte, sans schéma rigide imposé.
  - Pas d'emoji ✅ automatique sur la confirmation.
  - Le gras reste occasionnel, pas systématique sur chaque prix.
  - Le ton général se lit comme une conversation fluide, pas comme un remplissage de gabarit.
- Non-régression `AI_PROVIDER=claude` : comportement inchangé.