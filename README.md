# Screeps — rclsilver

Colonie autonome sur `https://screeps.betrancourt.net`, branche de jeu `default`.
Salle de départ : **W2N2**, Spawn1 en **(14, 26)**.

## Organisation

- `main.js` : seul module de jeu, synchronisé directement par le client Steam.
- `test/scenarios.cjs` : scénarios de survie, économie et construction.
- `test/main.test.cjs` : exécution des scénarios avec le runner de Node.js.
- `scripts/api.sh` : inspection du joueur, du code, de la mémoire et de la salle en lecture seule.
- `docs/STRATEGY.md` : priorités, limites et suivi de la colonie.
- `.env.example` : noms des identifiants requis, sans valeurs réelles.

Le dépôt est dans le dossier de scripts du client. Modifier `main.js` revient à
préparer une publication par la synchronisation Steam : vérifier les changements
avant de l'enregistrer. Les outils et tests sont dans des sous-dossiers ; aucun
autre fichier JavaScript de jeu n'est nécessaire à la racine.

## Développement

Node.js 20 ou supérieur et Bash sont requis pour les contrôles locaux. Aucun
paquet npm ni service externe n'est nécessaire au fonctionnement de la colonie.

```sh
npm run check
npm test
```

Les tests utilisent un monde Screeps simulé, avec un scénario indépendant par
test. Ils vérifient notamment les budgets de création, le remplacement des creeps,
la livraison d'énergie, la migration de mémoire et les limites de construction.
Ils ne remplacent pas l'observation de plusieurs ticks dans le vrai monde.

## Accès joueur et observation

Créer `.env` à partir de `.env.example`, puis y renseigner `TOKEN` et
`SERVER_PASSWORD`. Ce fichier est ignoré par Git. Un autre emplacement peut être
fourni avec `SCREEPS_CREDENTIALS_FILE`. Le fichier est lu comme des données ; il
n'est jamais exécuté comme un script shell. Les en-têtes privés passent par
l'entrée standard de curl, sans apparaître dans ses arguments.

Prérequis de l'outil API : Bash, curl, jq, base64, gzip et sed.

```sh
bash scripts/api.sh inspect
bash scripts/api.sh memory
bash scripts/api.sh room W2N2
bash scripts/api.sh code
```

La commande `code` lit le code du serveur, utile pour une sauvegarde privée avant
mise à jour. Ne pas commiter de sauvegardes de mémoire ou de fichiers privés.

## Synchronisation et Git

La publication habituelle se fait **par le client Steam**, sans second envoi API.
Si le client propose un conflit, comparer les versions avant de choisir le sens
de synchronisation ; ne pas renvoyer un ancien fichier local vide sur le serveur.
Relire `bash scripts/api.sh code` après un changement pour confirmer que le module
actif correspond bien à `main.js`.

La branche Git `master` suit `origin/master` sur `git@github.com:rclsilver/screeps.git`.
Elle est indépendante de la branche de jeu `default`. Le known directory Threavia
est `screeps` ; il conserve le chemin correspondant à chaque machine.

L'agent peut modifier et publier les scripts du joueur et utiliser les actions
normales de développement de la colonie. Attaque, abandon de salle ou démolition
importante demandent un accord préalable. Aucune administration du serveur ou de
l'infrastructure n'est nécessaire à ce dépôt.
