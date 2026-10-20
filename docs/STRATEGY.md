# Début de partie

Le script poursuit la colonie existante : il ne crée pas de nouveau spawn, ne
réinitialise pas la mémoire et ne détruit aucune structure. Les anciens champs
`home`, `role`, `working` et `source` restent compatibles.

## Priorités

1. Relancer la récolte avec un corps WORK/CARRY/MOVE à 200 énergie si moins de
   deux récolteurs viables subsistent. En dessous de 200, attendre les livraisons
   et la régénération d'énergie du spawn.
2. Obtenir deux récolteurs, un améliorateur, puis compléter jusqu'à quatre
   récolteurs pour deux sources, un bâtisseur si des chantiers existent et deux
   améliorateurs. Les creeps en cours de création sont comptés.
3. Remplacer les creeps avant leur mort, avec un délai égal au temps de création
   de leur corps plus 30 ticks. Hors secours, économiser pour des corps plus
   grands selon la capacité de la salle, avec un budget plafonné à 800 énergie.
4. Remplir spawn et extensions avant les travaux. En l'absence de récolteur
   actif, les autres rôles assurent aussi les livraisons. Ne jamais prélever
   d'énergie dans le spawn ou les extensions pour la leur rapporter.
5. Empêcher la rétrogradation du contrôleur, puis avancer les constructions et
   l'amélioration. Un bâtisseur sans chantier et un récolteur sans livraison
   utile participent à l'amélioration.
6. Dès RCL2, construire progressivement les extensions autorisées, avec trois
   chantiers simultanés au maximum. Préserver les abords des sources, du minerai
   et du contrôleur, les voies entre extensions, et vérifier l'accès depuis le
   spawn avant de placer un chantier.

Les travailleurs gardent leur source et les nouveaux se répartissent selon
l'occupation. Ils récupèrent aussi l'énergie tombée à proximité, dans les
conteneurs, tombes et ruines. Les routes et conteneurs existants sont réparés
avant qu'ils deviennent trop abîmés ; aucun réseau de routes n'est créé
automatiquement à ce stade.

Les tours déjà présentes défendent la salle et soignent les creeps. Le script
ne crée ni armée, ni extension territoriale, ni nouvelle tour. Le passage à une
économie de mineurs fixes, transporteurs et conteneurs sera une évolution
distincte, à dimensionner après observation du début de partie.

## Suivi et récupération

`Memory.colony` conserve la version, le dernier tick, le nombre cumulé d'erreurs,
la dernière erreur et les métriques CPU. Chaque salle enregistre dans `rooms`
sa population, ses objectifs, le résultat de création et, tous les 20 ticks,
le niveau du contrôleur, sa progression, l'énergie et les chantiers.

Une erreur individuelle ne bloque pas les autres creeps. Les messages d'erreur
sont espacés d'au moins 50 ticks ; la mémoire des creeps morts est nettoyée.
Le traitement des travailleurs s'arrête avant 80 % de la limite CPU du tick.

Après une mise à jour : vérifier la version dans la mémoire, l'absence de
nouvelles erreurs, la progression du contrôleur/des chantiers et le remplacement
effectif d'un creep arrivé en fin de vie. Comparer également le code distant au
fichier local pour détecter une synchronisation Steam interrompue.
