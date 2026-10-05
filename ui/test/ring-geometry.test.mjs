import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ang, wedge, fanOrder, fanAngle, closestByAngle, nearest, FAN_STEP } from '../renderer/ring-geometry.js';

const deg = r => Math.round(r * 180 / Math.PI);

test('slots go clockwise from the top', () => {
  assert.equal(deg(ang(0)), -90);   // up
  assert.equal(deg(ang(2)), 0);     // right
  assert.equal(deg(ang(4)), 90);    // down
  assert.equal(deg(ang(6)), 180);   // left
});

test('a direction picks the slot of its 45° wedge', () => {
  assert.equal(wedge(0, -10), 0);
  assert.equal(wedge(10, -10), 1);
  assert.equal(wedge(10, 0), 2);
  assert.equal(wedge(0, 10), 4);
  assert.equal(wedge(-10, 0), 6);
  assert.equal(wedge(-10, -10), 7);
  // the edges between wedges: 22.5° either side of a slot
  assert.equal(wedge(Math.sin(20 * Math.PI / 180), -Math.cos(20 * Math.PI / 180)), 0);
  assert.equal(wedge(Math.sin(25 * Math.PI / 180), -Math.cos(25 * Math.PI / 180)), 1);
});

test("a folder's actions fan out centred on the folder, 20° apart", () => {
  const { order, n } = fanOrder(['a', null, 'b', 'c', null]);
  assert.equal(n, 3);
  assert.deepEqual([order[0], order[2], order[3]], [0, 1, 2]);
  // folder on the right (slot 2): the middle action points right, its neighbours 20° either side
  assert.equal(deg(fanAngle(2, 1, 3)), 0);
  assert.equal(deg(fanAngle(2, 0, 3)), -FAN_STEP);
  assert.equal(deg(fanAngle(2, 2, 3)), FAN_STEP);
  // an even count straddles the folder's direction
  assert.equal(deg(fanAngle(4, 0, 2)), 80);
  assert.equal(deg(fanAngle(4, 1, 2)), 100);
});

test('steering picks the closest action within half a step', () => {
  const angles = [0, 20, 40].map(d => d * Math.PI / 180);
  assert.equal(closestByAngle(18 * Math.PI / 180, angles), 1);
  assert.equal(closestByAngle(-15 * Math.PI / 180, angles), 0);
  assert.equal(closestByAngle(80 * Math.PI / 180, angles), -1);
  assert.equal(closestByAngle(Math.PI, [null, -Math.PI + 0.1]), 1);   // across ±180°
});

test('the pointer picks the nearest button within reach', () => {
  const pts = [{ x: 0, y: 0 }, null, { x: 10, y: 0 }];
  assert.equal(nearest(pts, 8, 1, 5), 2);
  assert.equal(nearest(pts, 1, 1, 5), 0);
  assert.equal(nearest(pts, 50, 50, 5), -1);
});
