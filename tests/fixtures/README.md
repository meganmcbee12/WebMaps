`synthetic-terrain.lerc` is a synthetic test elevation grid, not California data.
Its 257×257 height posts range from 400 to 2,000 meters and repeat a sinusoidal
profile. The geographic tile grid is 256×256; posts include the shared edges.
The ArcGIS 4.34 elevation worker reads legacy LERC1 (`CntZImage`) tiles. Regenerate
this uncompressed float32 fixture with `python3 tests/fixtures/generate-synthetic-terrain.py`.

Only the browser test intercepts the elevation endpoint with this file. The
production app uses Esri's public WorldElevation3D service. Real elevation-host
access must be checked separately from this fixture's rendering tests.
