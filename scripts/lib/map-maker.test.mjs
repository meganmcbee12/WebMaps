import test from 'node:test';
import assert from 'node:assert/strict';
import { bboxBoundary, boundaryGeoJSON, csvPoints, arcgisRings } from '../../src/map-maker-data.ts';
test('boundary import preserves multipolygons and holes and rejects non-WGS84 inputs', () => {
  const g = bboxBoundary('-119, 34, -118, 35');
  assert.equal(boundaryGeoJSON(g).length, 1);
  assert.equal(boundaryGeoJSON({type:'MultiPolygon',coordinates:[g.coordinates,g.coordinates]}).length,2);
  assert.throws(() => bboxBoundary('-118, 35, -119, 34'));
  assert.throws(() => bboxBoundary(' , , , '));
  assert.throws(() => bboxBoundary('100000, 34, 200000, 35'));
  assert.throws(() => boundaryGeoJSON({type:'Point',coordinates:[-119,34]}));
  assert.throws(() => boundaryGeoJSON({type:'Polygon',coordinates:[[[-119,34],[-118,34],[-118,35],[-117,35]]]}));
});
test('CSV imports attributes, quoted commas, escaped quotes and multiline fields', () => {
  const d=csvPoints('name,latitude,longitude,notes\r\n"A, B",34.5,-118.3,"a ""quote""\nand a new line"\r\n');
  assert.deepEqual(d.features[0].geometry.coordinates,[-118.3,34.5]);
  assert.equal(d.features[0].properties.name,'A, B');
  assert.equal(d.features[0].properties.notes,'a "quote"\nand a new line');
});
test('CSV rejects missing coordinates, duplicate headers and invalid rows instead of silently dropping data', () => {
  for(const input of ['name,lat,lon\na,,2','name,lat,lon\na,100,2','lat,lon\n1,2,3','name,lat\na,2','lat,lon,lat\n1,2,3','lat,lon\n"1,2']) assert.throws(()=>csvPoints(input));
});

test('ArcGIS conversion orients outer rings and holes without moving vertices', () => {
  const rings=bboxBoundary('-119,34,-118,35').coordinates;
  const withHole=[rings[0],bboxBoundary('-118.8,34.2,-118.2,34.8').coordinates[0]];
  const converted=arcgisRings(withHole);
  const area=r=>r.slice(0,-1).reduce((s,p,i)=>s+p[0]*r[i+1][1]-r[i+1][0]*p[1],0);
  assert.ok(area(converted[0])<0); assert.ok(area(converted[1])>0);
  assert.deepEqual(new Set(converted[0].map(String)),new Set(rings[0].map(String)));
  assert.equal(boundaryGeoJSON({type:'Polygon',coordinates:withHole})[0].length,2);
});
