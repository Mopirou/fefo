# HACCP — outil interne stock + registres (V1)

Appli web servie par le PC du bar, utilisée depuis le téléphone via le Wi-Fi local. Architecture identique à Next-adventure-app (Express + Vue 3/Vite, `backend/` + `frontend/`), mais **base SQLite séparée** (`backend/data/haccp.db`, via `node:sqlite`), ports et certificats propres : aucun lien avec le jeu.

| | Port |
|---|---|
| API + appli en production (HTTPS) | 3100 |
| Vite en développement | 5183 (proxy `/api` → 3100) |

## Démarrage
Prérequis : Node 22.5+ (testé en Node 24).

```powershell
winget install FiloSottile.mkcert      # une fois
powershell -File scripts/setup_https.ps1   # certificat + instructions téléphone
powershell -File scripts/run.ps1           # build + serveur
```
Puis ouvrir `https://<ip-du-pc>:3100` sur le PC et le téléphone. Sans `certs/`, le serveur démarre en HTTP et le scan caméra sera refusé sur téléphone.

## Développement
```bash
cd backend && npm test          # tests Jest (SQLite en mémoire)
cd backend && npm start         # API
cd frontend && npm run dev      # interface
```

## État
- Étape 1 : socle + catalogue produits.
- Étape 2 : scan caméra (html5-qrcode, EAN-13/8 + QR) et favoris, réception (lot, DLC, température, conformité), stock par lot avec sortie FEFO, alertes (stock bas, DLC J-1 / J / périmé), inventaire rapide avec écart. Un EAN inconnu scanné ouvre la fiche produit pré-remplie. Un lot non conforme est enregistré mais jamais proposé en sortie.
- Étape 3 : recettes, fabrication de lots (ingrédients déduits en FEFO, lots sources enregistrés, DLC = +3 j max sauf justification), congélation (avant la DLC) et décongélation (nouvelle DLC, recongélation interdite), étiquette (impression directe via le spouleur Windows ou CUPS, PDF de secours). Imprimante et durées dans Réglages.
- Étape 4 : ventes de fin de service (saisie ou import CSV tout-ou-rien, colonnes détectées par nom), pertes avec motif (sortie FEFO, périmés inclus), tableau de bord sur période (valeur du stock, CA, coût matière, marge brute, pertes en € et % du CA, profit, coût par recette et par boisson). Prix et coût sont figés à chaque vente.
- Étape 5 : registres HACCP (relevés de température matin/soir par enceinte avec seuil selon le type, alerte et action corrective, refroidissement rapide +63→+10 °C en 2 h, plan de nettoyage quotidien/hebdomadaire/mensuel), liste du jour (relevés manquants, alertes sans action), export PDF des registres sur une période, fiche de traçabilité PDF d'un lot (amont et aval).
- Reste : photo de l'étiquette à la réception (souhaitable), finitions (codes PIN, sauvegarde quotidienne, export CSV).

Sauvegarde : copier `backend/data/haccp.db`.
