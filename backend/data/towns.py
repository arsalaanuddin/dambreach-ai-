"""Town and road dataset — mirrors frontend src/data/damData.ts.

Kept in sync manually; the frontend remains the source of truth for map
geometry, and this module provides the sampling targets for damage analysis.
"""

TOWNS = [
    {"id": "t1",  "name": "Vallakkadavu",         "population": 3400,   "distanceKm": 1.5,  "lateralKm": 0.3},
    {"id": "t2",  "name": "Murinjapuzha",         "population": 6100,   "distanceKm": 9.5,  "lateralKm": 0.5},
    {"id": "t3",  "name": "Mlappara",             "population": 4700,   "distanceKm": 15.5, "lateralKm": 0.8},
    {"id": "t4",  "name": "Upputhara",            "population": 9800,   "distanceKm": 20.0, "lateralKm": 0.4},
    {"id": "t5",  "name": "Ayyappancoil",         "population": 11200,  "distanceKm": 26.5, "lateralKm": 0.6},
    {"id": "t6",  "name": "Kamakshipuram",        "population": 7600,   "distanceKm": 31.0, "lateralKm": 1.1},
    {"id": "t7",  "name": "Kattappana Outskirts", "population": 15800,  "distanceKm": 40.0, "lateralKm": 3.8},
    {"id": "t8",  "name": "Cheruthoni (Idukki)",  "population": 12400,  "distanceKm": 60.0, "lateralKm": 0.5},
    {"id": "t9",  "name": "Kulamavu",             "population": 5400,   "distanceKm": 63.0, "lateralKm": 2.1},
    {"id": "t10", "name": "Painavu",              "population": 8900,   "distanceKm": 65.0, "lateralKm": 3.6},
    {"id": "t11", "name": "Vazhathope",           "population": 6800,   "distanceKm": 70.0, "lateralKm": 1.2},
    {"id": "t12", "name": "Kothamangalam",        "population": 41000,  "distanceKm": 96.0, "lateralKm": 4.2},
    {"id": "t13", "name": "Malayattoor",          "population": 6800,   "distanceKm": 108.0,"lateralKm": 0.4},
    {"id": "t14", "name": "Kalady",               "population": 24600,  "distanceKm": 126.0,"lateralKm": 1.8},
    {"id": "t15", "name": "Perumbavoor",          "population": 51200,  "distanceKm": 133.0,"lateralKm": 0.4},
    {"id": "t16", "name": "Aluva",                "population": 104000, "distanceKm": 140.0,"lateralKm": 0.3},
]

ROAD_KM = {"r1": 30, "r2": 24, "r3": 95, "r4": 132}
