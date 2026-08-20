# Super Yams

Application Next.js mobile-first pour suivre une partie de Super Yams jusqu'a 10 joueurs.

## Lancer en local

```bash
npm install
npm run dev
```

## Docker

```bash
docker compose up --build
```

## Regles preconfigurees

- Partie haute 1 a 6 avec bonus a 60 => +30
- Brelan = somme des 5 des, double si sec
- Carre = 40, Full = 20, Petite suite = 25, Grande suite = 35, Yams = 60
- Moins de 8 = 50
- Plus de 27 = 50 par defaut, modifiable dans l'app
- Moins / Plus = somme des 5 des avec contrainte stricte (`Plus > Moins`)
- Chance = somme des 5 des

Les valeurs fixes peuvent etre ajustees dans le panneau `Regles`.

