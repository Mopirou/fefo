# Semaine de test en service réel

Objectif : vérifier que l'outil tient la route pendant 7 jours de vrai service, puis corriger. À faire avec le matériel réel (PC du bar, téléphone de cuisine, imprimante).

## Avant de commencer (jour 0)
- [ ] `scripts/setup_https.ps1` lancé, certificat mkcert installé sur le téléphone, `https://<ip-du-pc>:3100` s'ouvre sans avertissement.
- [ ] Le scan caméra lit un EAN-13 réel (canette, bouteille) depuis le téléphone (Android / iPhone selon celui retenu).
- [ ] Imprimante choisie dans Réglages ; une étiquette de test sort sans boîte de dialogue, depuis le PC **et** depuis le téléphone.
- [ ] Dossier de sauvegarde pointé vers Google Drive ou la clé USB ; « Sauvegarder maintenant » réussit.
- [ ] Catalogue saisi : produits courants + 20 favoris, fournisseurs, allergènes, catégories de température.
- [ ] Enceintes créées avec le bon type et le bon seuil pour leur contenu ; plan de nettoyage saisi.
- [ ] Un compte PIN par personne (2 à 3).
- [ ] Seuils des Réglages relus avec le plan de maîtrise sanitaire (DLC 3 j, décongélation 24 h, refroidissement 2 h).
- [ ] Inventaire de départ saisi.

## Chaque jour
- [ ] Relevé de température matin et soir pour chaque enceinte (liste « Relevés manquants » vide).
- [ ] Toute alerte a une action corrective renseignée.
- [ ] Réceptions saisies au fil de l'eau (DLC, lot, température, conformité).
- [ ] Préparations déclarées avec étiquette imprimée ; refroidissement rapide noté pour les plats chauds.
- [ ] Ventes de fin de service saisies (ou CSV importé).
- [ ] Pertes déclarées avec leur motif.
- [ ] Nettoyage coché.

## À noter pendant la semaine
Pour chaque friction, noter : le jour, l'écran, ce qui a gêné, le temps perdu.

- Le scan est-il plus rapide ou plus lent que la recherche / les favoris ?
- Des produits manquent-ils dans les favoris ?
- Le téléphone perd-il la connexion Wi-Fi en cuisine ?
- Des étiquettes sont-elles illisibles ou coupées ?
- Le format du CSV de la caisse est-il reconnu (colonnes) ? Sinon, joindre un exemple.
- Les alertes (DLC, stock bas) sont-elles pertinentes ou trop nombreuses ?
- Quelqu'un a-t-il oublié son PIN, ou été bloqué par le verrouillage (5 essais) ?
- Le PC a-t-il été éteint pendant le service ? La sauvegarde du jour a-t-elle quand même eu lieu ?

## Fin de semaine
- [ ] Inventaire réel comparé au stock théorique : écart par produit, causes (oublis de saisie, pertes non déclarées, erreurs de lot).
- [ ] Export PDF des registres de la semaine : relu comme le ferait un contrôleur DDPP (relevés complets, alertes corrigées, auteur indiqué).
- [ ] Fiche de traçabilité d'un lot de préparation relue : remonte bien jusqu'au lot fournisseur.
- [ ] Tableau de bord : marge brute et pertes plausibles par rapport au ressenti.
- [ ] Sauvegarde : 7 fichiers présents ; une restauration d'essai sur un autre dossier fonctionne.
- [ ] Liste des corrections classée : bloquant / gênant / confort.
