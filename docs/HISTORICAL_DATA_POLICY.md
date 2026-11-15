# Données historiques : règles

État au 15 novembre 2026 : **le jeu ne contient aucune donnée historique vérifiée pour la campagne Monde.**

- Une donnée historique n'entre dans `src/data/world/` qu'avec : une source consultable (URL, titre, auteur ou organisme, date), un niveau de confiance (A preuve directe, B fortement étayé, C reconstruction plausible, D débattu, E spéculatif, exclu), une fenêtre de dates plutôt qu'une date unique, et la licence de toute ressource reprise.
- Les faits (`historicalClaims`) et les chiffres de jeu (`gameplayHypotheses`) restent séparés. Un chiffre de combat est toujours une hypothèse d'équilibrage.
- Sans fiche, on emploie un archétype déclaré abstrait, jamais un nom historique.
- Une date de première attestation n'est pas un verrou : ce sont les prérequis (ressources, savoir, atelier, organisation) qui ouvrent une capacité.
- Les références des rapports R1 et R2 (`citeturn…`, `fileciteturn…`) ne sont pas des sources : chaque fait repris doit être revérifié.

## Sources déjà employées

| Donnée | Source | Licence |
|---|---|---|
| Trait de côte du théâtre « Europe de l'Ouest » | Natural Earth 1:50m land, naturalearthdata.com | domaine public |

Le découpage en régions (`tools/build-world.py`) est une abstraction de jeu : cellules de Voronoï autour de points posés à la main.
