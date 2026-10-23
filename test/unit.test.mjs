import { test } from "node:test";
import assert from "node:assert/strict";
import { waitToDays, parseQueue, provinceFromTeryt } from "../dist/nfz.js";
import { nameFragments, isChildren, isHospital } from "../dist/specialties.js";
import { titleCase, fold } from "../dist/text.js";
import { pickBenefits } from "../dist/report.js";

test("waitToDays", () => {
  assert.equal(waitToDays("0 dni"), 0);
  assert.equal(waitToDays("26 dni"), 26);
  assert.equal(waitToDays("1 mies. 2 tyg."), 44);
  assert.equal(waitToDays("2 mies."), 60);
  assert.equal(waitToDays("1 rok 3 mies."), 455);
  assert.equal(waitToDays(null), null);
  assert.equal(waitToDays("brak"), null);
});

test("provinceFromTeryt: TERYT voivodeship / 2 = NFZ branch code", () => {
  assert.equal(provinceFromTeryt("146501"), "07");
  assert.equal(provinceFromTeryt("306401"), "15");
  assert.equal(provinceFromTeryt("021101"), "01");
  assert.equal(provinceFromTeryt("3261011"), "16");
});

test("nameFragments: everyday words -> NFZ names", () => {
  assert.equal(nameFragments("okulista")[0], "OKULISTY");
  assert.equal(nameFragments("do ortopedy")[0], "ORTOPEDII");
  assert.equal(nameFragments("laryngolog")[0], "OTOLARYNGOLOGII");
  assert.equal(nameFragments("rezonans magnetyczny kolana")[0], "REZONANS");
  assert.equal(nameFragments("MRI")[0], "REZONANS");
  assert.equal(nameFragments("zaćma")[0], "SOCZEWKI");
  assert.equal(nameFragments("psychiatra")[0], "ZDROWIA PSYCHICZNEGO");
  assert.ok(nameFragments("kardiologa").includes("KARDIOLOG"));
  assert.ok(nameFragments("PORADNIA DERMATOLOGICZNA").includes("PORADNIA DERMATOLOGICZNA"));
});

test("benefit classes", () => {
  assert.ok(isChildren("PORADNIA DERMATOLOGICZNA DLA DZIECI"));
  assert.ok(!isChildren("PORADNIA DERMATOLOGICZNA"));
  assert.ok(isHospital("ODDZIAŁ OKULISTYCZNY"));
  assert.ok(!isHospital("ŚWIADCZENIA Z ZAKRESU OKULISTYKI"));
});

test("pickBenefits prefers the outpatient clinic, adults or children as asked", () => {
  const names = ["ODDZIAŁ OKULISTYCZNY", "ODDZIAŁ OKULISTYCZNY DLA DZIECI", "ŚWIADCZENIA Z ZAKRESU OKULISTYKI"];
  assert.deepEqual(pickBenefits(names, {}), ["ŚWIADCZENIA Z ZAKRESU OKULISTYKI"]);
  assert.deepEqual(pickBenefits(names, { hospital: true }), ["ODDZIAŁ OKULISTYCZNY"]);
  assert.deepEqual(pickBenefits(names, { hospital: true, children: true }), ["ODDZIAŁ OKULISTYCZNY DLA DZIECI"]);
  const derm = ["ODDZIAŁ DERMATOLOGICZNY", "PORADNIA DERMATOLOGICZNA", "PORADNIA DERMATOLOGICZNA DLA DZIECI"];
  assert.deepEqual(pickBenefits(derm, { children: true }), ["PORADNIA DERMATOLOGICZNA DLA DZIECI"]);
});

test("titleCase", () => {
  assert.equal(titleCase('NIEPUBLICZNY ZAKŁAD OPIEKI ZDROWOTNEJ "ŻYCIE"'), "Niepubliczny Zakład Opieki Zdrowotnej „Życie”");
  assert.equal(titleCase("LUX MED SP. Z O.O."), "Lux Med Sp. z o.o.");
  assert.equal(titleCase("BONUS SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ"), "Bonus Sp. z o.o.");
  assert.equal(titleCase("SPZOZ W ZAKOPANEM"), "SPZOZ w Zakopanem");
  assert.equal(titleCase("Already Mixed"), "Already Mixed");
  assert.equal(fold("Łódź"), "lodz");
});

test("parseQueue (API 1.4 record)", () => {
  const q = parseQueue({
    id: "x1",
    attributes: {
      case: 1, benefit: "PORADNIA DERMATOLOGICZNA", provider: "NZOZ", place: "PORADNIA", address: "MACZKA 7", locality: "PŁOŃSK",
      phone: "(23) 6623149", "teryt-place": "1420011", "benefits-for-children": "N", toilet: "Y", ramp: "N", elevator: "Y", latitude: null,
      statistics: { "provider-data": { awaiting: 8, removed: 48, "average-period": 5, update: "2026-09" } },
      dates: { applicable: true, pcus: "1 mies. 1 tydz.", "date-situation-as-at": "2026-10-10" },
    },
  });
  assert.equal(q.wait, "1 mies. 1 tydz.");
  assert.equal(q.waitDays, 37);
  assert.equal(q.awaiting, 8);
  assert.equal(q.children, false);
  assert.equal(q.lat, undefined);
  assert.deepEqual(q.access, ["winda", "toaleta dla niepełnosprawnych"]);
  const empty = parseQueue({ id: "x2", attributes: { dates: null, statistics: null } });
  assert.equal(empty.wait, null);
  assert.equal(empty.awaiting, null);
});

test("pickBenefits: AOS 'ŚWIADCZENIA Z ZAKRESU' first, rehab last", () => {
  assert.deepEqual(pickBenefits(["PORADNIA ENDOKRYNOLOGICZNA OSTEOPOROZY", "ŚWIADCZENIA Z ZAKRESU ENDOKRYNOLOGII", "ODDZIAŁ ENDOKRYNOLOGICZNY"], {}), ["ŚWIADCZENIA Z ZAKRESU ENDOKRYNOLOGII"]);
  assert.deepEqual(pickBenefits(["PORADNIA REHABILITACJI NEUROLOGICZNEJ", "ŚWIADCZENIA Z ZAKRESU NEUROLOGII"], {}), ["ŚWIADCZENIA Z ZAKRESU NEUROLOGII"]);
  assert.deepEqual(pickBenefits(["REZONANS MAGNETYCZNY"], {}), ["REZONANS MAGNETYCZNY"]);
});
