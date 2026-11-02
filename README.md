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
- Reste : photo de l'étiquette à la réception (souhaitable), préparations, pertes/ventes/tableau de bord, registres HACCP, finitions.

Sauvegarde : copier `backend/data/haccp.db`.
