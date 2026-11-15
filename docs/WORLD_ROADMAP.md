# Campagne Monde : jalons

| Tranche | Contenu | État |
|---|---|---|
| 0 | Audit du dépôt, comparaison visuelle avant/après pixel art, décisions | fait (15 nov. 2026) |
| 1 | Onglet Monde, théâtre de 28 régions, calendrier variable, choix du départ, attaque jouée ou automatique, autres sociétés, zoom, sauvegarde versionnée | **fait** |
| 2 | Économie (nourriture, population, stockage) et savoirs (connu / productible) ; la puissance cesse de valoir 1 | à valider |
| 3 | Attaques adverses annoncées et défense jouée ; calibrage de la bataille jouée contre la chance affichée | à valider |
| 4 | Ordres permanents, avance de N tours ou jusqu'à un événement | à valider |
| 5 | Données historiques sourcées (voir HISTORICAL_DATA_POLICY.md), navigation, second théâtre | à valider |

## Tests en place (tranche 1)

`src/world/world.test.ts`, 19 tests : calendrier (seuils, pas d'année zéro, 436 tours jusqu'en 2026), carte (voisinages réciproques, d'un seul tenant, aucun nom d'État), chances (symétrie, bornes, tirage conforme à l'affichage sur 400 parties), partie (départ, attaques, 300 tours sans incohérence, reproductibilité avec sauvegarde, refus d'une autre version).

Les 173 tests de la campagne France et du moteur sont inchangés.

## À mesurer avant la tranche 2

- Le rythme : à 50 ans par tour, combien de tours le joueur accepte-t-il avant que quelque chose change ?
- L'écart entre la chance affichée et le résultat des batailles jouées.
- Les départs à une seule voisine.
