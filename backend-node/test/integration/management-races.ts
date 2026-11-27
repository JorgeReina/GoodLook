import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { MysqlAuthStore } from '../../src/auth/mysql-store.js';

type Booking = { actorId: string; businessId: string; professionalId: string; serviceId: string; startAt: string };
const plus = (date: string, minutes: number) => new Date(Date.parse(date) + minutes * 60_000).toISOString();

async function session(store: MysqlAuthStore, userId: string) {
  const token = randomBytes(32).toString('hex');
  await store.createSession(createHash('sha256').update(token).digest('hex'), userId, new Date(Date.now() + 60_000));
  return 'goodlook_session=' + token;
}

export async function verifyManagementRaces(pool: Pool, store: MysqlAuthStore, base: string, origin: string, booking: Booking, owner: string) {
  const ownerCookie = await session(store, owner);
  const clientCookie = await session(store, booking.actorId);
  const request = (path: string, method: string, cookie: string, body: object, headers: Record<string, string> = {}) =>
    fetch(base + path, { method, headers: { 'content-type': 'application/json', origin, cookie, ...headers }, body: JSON.stringify(body) });
  const staffPath = `/api/manage/businesses/${booking.businessId}/staff/${booking.professionalId}`;
  const managementPath = `/api/manage/businesses/${booking.businessId}`;
  const book = (startAt: string, priceCents = 1500) => request('/api/bookings', 'POST', clientCookie, {
    businessId: booking.businessId, professionalId: booking.professionalId, serviceId: booking.serviceId, startAt,
    quote: { priceCents, currency: 'EUR', durationMinutes: 30 },
  }, { 'Idempotency-Key': randomUUID() });

  const first = plus(booking.startAt, 2 * 1440);
  const second = plus(first, 30);
  assert.equal((await book(first)).status, 201);
  const range = { startAt: first, endAt: plus(second, 30) };
  const stage = () => request(staffPath + '/closures', 'POST', ownerCookie, range);
  const before = await stage();
  assert.equal(before.status, 409);
  const oldImpact = await before.json() as { code: string; affectedCount: number; impactToken: string };
  assert.equal(oldImpact.code, 'impact_confirmation_required');
  assert.equal(oldImpact.affectedCount, 1);
  assert.equal((await book(second)).status, 201);
  const confirmation = (token: string) => request(staffPath + '/closures', 'POST', ownerCookie, range, { 'X-GoodLook-Impact': token });
  const stale = await confirmation(oldImpact.impactToken);
  assert.equal(stale.status, 409);
  const updated = await stale.json() as typeof oldImpact;
  assert.equal(updated.code, 'impact_confirmation_required');
  assert.equal(updated.affectedCount, 2);
  assert.notEqual(updated.impactToken, oldImpact.impactToken);
  assert.equal((await confirmation(updated.impactToken)).status, 201);

  const raceStart = plus(second, 60);
  const [reservation, closure] = await Promise.all([
    book(raceStart),
    request(staffPath + '/closures', 'POST', ownerCookie, { startAt: raceStart, endAt: plus(raceStart, 30) }),
  ]);
  if (reservation.status === 201) {
    assert.equal(closure.status, 409);
    assert.equal((await closure.json() as typeof oldImpact).affectedCount, 1);
  } else {
    assert.equal(reservation.status, 409);
    assert.deepEqual(await reservation.json(), { code: 'slot_unavailable' });
    assert.equal(closure.status, 201);
  }

  const [kept] = await pool.execute<RowDataPacket[]>(
    "SELECT status FROM appointments WHERE business_id=? AND professional_id=? AND start_at IN (?,?) ORDER BY start_at",
    [booking.businessId, booking.professionalId, new Date(first), new Date(second)],
  );
  assert.deepEqual(kept.map(row => row.status), ['booked', 'booked']);

  const priceSlot = plus(raceStart, 60);
  const [quoted, price] = await Promise.all([
    book(priceSlot),
    request(managementPath + '/services/' + booking.serviceId, 'PATCH', ownerCookie, { priceCents: 2100 }),
  ]);
  assert.equal(price.status, 204);
  if (quoted.status === 201) {
    assert.equal((await quoted.json() as { priceCents: number }).priceCents, 1500);
  } else {
    assert.equal(quoted.status, 409);
    assert.deepEqual(await quoted.json(), { code: 'offer_changed', quote: { priceCents: 2100, currency: 'EUR', durationMinutes: 30 } });
  }

  const [blocked, adjustHours] = await Promise.all([
    book(plus(raceStart, 1440), 2100),
    request(staffPath + '/hours', 'PUT', ownerCookie, { hours: [] }),
  ]);
  assert.equal(adjustHours.status, 409);
  assert.equal((await adjustHours.json() as typeof oldImpact).code, 'impact_confirmation_required');
  assert.equal(blocked.status, 201);

  const [visibilityBooking, visibility] = await Promise.all([
    book(plus(raceStart, 2 * 1440), 2100),
    request(managementPath + '/visibility', 'PUT', ownerCookie, { isPublic: false }),
  ]);
  assert.equal(visibility.status, 204);
  if (visibilityBooking.status !== 201) {
    assert.equal(visibilityBooking.status, 409);
    assert.deepEqual(await visibilityBooking.json(), { code: 'slot_unavailable' });
  }
  const afterHide = await book(plus(raceStart, 3 * 1440), 2100);
  assert.equal(afterHide.status, 409);
  assert.deepEqual(await afterHide.json(), { code: 'slot_unavailable' });

  const outside = await request(managementPath + '/profile', 'PATCH', clientCookie, { name: 'Foreign' });
  assert.equal(outside.status, 403);
}
