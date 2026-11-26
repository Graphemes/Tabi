import { expect, test, type Page } from "@playwright/test";
import { api, expiredAccessToken, signUp, socketEvent, type TestUser } from "./support";

const GUWAHATI = { latitude: 26.1445, longitude: 91.7362 };
const NEAR_SHILLONG = { latitude: 25.57, longitude: 91.88 };
const BARAPANI = { latitude: 25.65, longitude: 91.88 };

/** The live sender holds a move inside its 15s window and sends it when the window ends. */
const SEND_WINDOW_MS = 15_000;

const memberPin = (page: Page, user: TestUser) =>
  page.locator(`.maplibregl-marker[title^="${user.displayName} ·"]`);

async function openTripMap(user: TestUser, tripName: string) {
  await user.page.getByRole("button", { name: "Map", exact: true }).first().click();
  await user.page.getByRole("button", { name: new RegExp(tripName) }).first().click();
  await expect(user.page.getByText(/by road|in a straight line/).first()).toBeVisible();
}

test("two members plan a road trip and see each other live", async ({ browser }) => {
  // Needs the public OSRM server for road routing, so allow for its latency.
  test.slow();

  const bob = await signUp(browser, NEAR_SHILLONG);
  const alice = await signUp(browser, GUWAHATI);
  const tripName = `E2E Meghalaya ${Date.now() % 10_000}`;
  let groupId = 0;

  await test.step("Alice creates a trip and adds Bob via member search", async () => {
    await alice.page.getByRole("button", { name: "Create a trip" }).first().click();
    await alice.page.getByPlaceholder(/Goa 2026/).fill(tripName);
    await alice.page.getByPlaceholder("Search by name or phone").fill(bob.phone);
    await alice.page.getByRole("button", { name: new RegExp(bob.phone) }).first().click();
    await alice.page.getByRole("button", { name: "Create trip" }).click();
    await expect(alice.page.getByText(tripName).first()).toBeVisible();

    const { data: groups } = await api<any[]>(alice.token, "GET", "/groups");
    const group = groups.find((g) => g.name === tripName);
    expect(group.members.map((m: any) => m.userId)).toContain(bob.profile.id);
    groupId = group.id;

    // Bob was online when he was added: the trip reaches his list without a reload.
    await expect(bob.page.getByText(tripName).first()).toBeVisible();
  });

  await test.step("places save, and a trip keeps a single destination", async () => {
    // Deliberately out of visit order.
    const places = [
      { name: "Dawki", kind: "STOP", latitude: 25.19, longitude: 92.02 },
      { name: "Cherrapunji", kind: "DESTINATION", latitude: 25.27, longitude: 91.73 },
      { name: "Shillong", kind: "STOP", latitude: 25.5788, longitude: 91.8933 },
      { name: "Guwahati", kind: "START", ...GUWAHATI },
      { name: "Barapani", kind: "STOP", ...BARAPANI },
    ];
    for (const place of places) {
      expect((await api(alice.token, "POST", `/groups/${groupId}/places`, place)).status).toBe(201);
    }
    const second = await api(alice.token, "POST", `/groups/${groupId}/places`, {
      name: "Another end", kind: "DESTINATION", latitude: 25.2, longitude: 92.03,
    });
    expect(second.status).toBe(409);
  });

  await test.step("the route is ordered optimally by road", async () => {
    await openTripMap(alice, tripName);
    await expect(alice.page.getByText(/km · .* by road/).first()).toBeVisible({ timeout: 30_000 });

    const rows = await alice.page.locator("ul").filter({ hasText: "Cherrapunji" }).last().locator("li").allInnerTexts();
    // Stop rows lead with their number badge; take the first line that isn't one.
    const order = rows.map((row) => row.split("\n").map((l) => l.trim()).find((l) => l && !/^\d+$/.test(l)));
    expect(order).toEqual(["Guwahati", "Barapani", "Shillong", "Dawki", "Cherrapunji"]);
  });

  await test.step("both share their location and see each other's pin", async () => {
    await openTripMap(bob, tripName);
    for (const user of [bob, alice]) {
      await user.page.getByRole("switch", { name: "Share my location with this trip" }).first().click();
      await expect(user.page.getByText("Location shared with the trip.").first()).toBeVisible();
    }
    await expect(memberPin(alice.page, bob)).toHaveCount(1);
    await expect(memberPin(bob.page, alice)).toHaveCount(1);
  });

  await test.step("Bob's move reaches Alice over the socket, not just by polling", async () => {
    const movedAt = Date.now();
    await bob.ctx.setGeolocation(BARAPANI);
    const update = await socketEvent(
      alice,
      movedAt,
      (e) => e.name === "location:update" && e.body.userId === bob.profile.id &&
        Math.abs(e.body.location.latitude - BARAPANI.latitude) < 1e-6,
      SEND_WINDOW_MS + 10_000,
    );
    expect(update.body.groupId).toBe(groupId);
  });

  await test.step("Trip info shows the same itinerary and both sharers", async () => {
    await alice.page.getByRole("button", { name: "Trips", exact: true }).first().click();
    await alice.page.getByRole("button", { name: new RegExp(tripName) }).first().click();
    await alice.page.getByRole("button", { name: tripName, exact: true }).first().click();
    await expect(alice.page.getByText("Itinerary").first()).toBeVisible();
    await expect(alice.page.getByText(/by road · 2 sharing live location/).first()).toBeVisible();
  });

  await test.step("closing one of two tabs doesn't take the backend down", async () => {
    const secondTab = await bob.ctx.newPage();
    await secondTab.goto("/");
    await expect(secondTab.getByText("Trips").first()).toBeVisible();
    await secondTab.close();
    await expect.poll(async () => (await api(alice.token, "GET", "/groups")).status).toBe(200);
  });

  await test.step("a stale access token: the socket refreshes and reconnects", async () => {
    const stale = expiredAccessToken(alice.profile.id);
    await alice.page.evaluate((t) => localStorage.setItem("tabi.accessToken", t), stale);
    const reloadedAt = Date.now();
    await alice.page.reload();

    await socketEvent(alice, reloadedAt, (e) => e.name === "auth:ok");
    const current = await alice.page.evaluate(() => localStorage.getItem("tabi.accessToken"));
    expect(current).toBeTruthy();
    expect(current).not.toBe(stale);

    // And live updates still arrive on the recovered socket.
    const movedAt = Date.now();
    await bob.ctx.setGeolocation(NEAR_SHILLONG);
    await socketEvent(
      alice,
      movedAt,
      (e) => e.name === "location:update" && e.body.userId === bob.profile.id,
      SEND_WINDOW_MS + 10_000,
    );
  });

  await test.step("Bob's pin disappears when he stops sharing", async () => {
    await openTripMap(alice, tripName);
    await expect(memberPin(alice.page, bob)).toHaveCount(1);
    await bob.page.getByRole("switch", { name: "Share my location with this trip" }).first().click();
    await expect(memberPin(alice.page, bob)).toHaveCount(0);
  });

  expect(alice.errors, "unexpected browser errors (Alice)").toEqual([]);
  expect(bob.errors, "unexpected browser errors (Bob)").toEqual([]);
});
