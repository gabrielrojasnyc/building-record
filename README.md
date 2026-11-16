# Building Record

Austin apartments, seen through the city's own complaint files.

**Live:** https://building-record-ecru.vercel.app

Pick an area on the map, or search an address or a building's name, and read what the City of Austin has on file for that apartment complex: how many code complaints it had in the last 12 months, 2 years and 3 years, what the city found, what is still open, and what the complaints were about. Each of the 2,496 complexes the city classifies as apartments has a record.

This is not an official City of Austin site.

## What it says, and what it will not say

- Every sentence on a record is counted from the city's rows by fixed rules. None is written by a model.
- A complaint is called a violation only where the city confirmed one.
- There is no score, grade or ranking. Counts are not adjusted for size, and a larger complex has more people who can complain.
- No complaints means none reached Code Enforcement. It does not mean a building has no problems.
- The site never reads an inspector's name or a property owner's name, though the city publishes both.

How every number is counted is written out on the site's [method page](https://building-record-ecru.vercel.app/method).

## Where the data comes from

Seven datasets on the City of Austin's open data portal:

- Austin Code Complaint Cases
- Repeat Offender Registrations
- Repeat Offender Property Deficiencies
- Austin 311 Public Data
- Land Use Inventory
- Addresses
- Building Footprints Year 2013

Building names and the map come from OpenStreetMap contributors, under the Open Database License, delivered through OpenMapTiles and OpenFreeMap. Aerial photos are the City of Austin's 2025 imagery, loaded by the browser straight from the city's server. This repository keeps no copy of them.

## Run it

It is built and tested with Node 22.

```bash
cd app
npm install
npm run data     # pulls the city's data and writes app/public/data
npm run dev      # http://localhost:3000
```

`npm run build` pulls the data first if it is missing. There is no database: the pull writes static files, and the site is built from them.

```bash
npm test         # unit tests
npm run e2e      # browser tests, at desktop and phone sizes
```

## How it is laid out

- `app/pipeline`: pulls and joins the city's datasets at build time.
- `app/src/domain`: the rules. Outcomes, periods, and the sentences of a record.
- `app/src/ui` and `app/src/map`: the screen and the map.
- `app/AGENTS.md`: where the app's state lives, for whoever works on the code next.
- `docs`: the design notes and the checks made along the way.
- `promo`: the scripts that filmed the short video of the site.

## How it was built

In three days in November 2026, with Claude Code writing the code and its tests.

## Licence

The code is under the MIT licence: see [LICENSE](LICENSE). The data belongs to its publishers and keeps their terms.
