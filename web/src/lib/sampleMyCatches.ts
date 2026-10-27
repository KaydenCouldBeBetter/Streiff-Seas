// Sample data for the MY-01 and MY-02 skeletons, matching the Figma frames (Flow 5: 47:1536,
// 47:1774, 47:1882, 48:1828, 48:1917, 48:1977). Nothing here comes from PocketBase: catches
// can't be read through the API until M0-03 opens their list and view rules. Replace this
// module with real reads then (see lib/myCatches.ts for where each field comes from).

import type { MyCatchesContext, MyCatchView } from "./myCatches";

export const SAMPLE_MY_CATCHES_CONTEXT: MyCatchesContext = {
  eventName: "Summer Bass 2027",
  metric: "weight",
  bestN: 10,
  phase: "live:window",
  entry: "active",
  // 8:00 PM Eastern (EDT) on Mon 16 Aug 2027, as on the EVT-02d sample.
  submitDeadline: new Date("2027-08-17T00:00:00Z"),
};

// Times are Eastern (EDT, UTC−4) in July 2027.
export const SAMPLE_MY_CATCHES: readonly MyCatchView[] = [
  {
    id: "sample-pending",
    species: "Largemouth bass",
    measurement: { value: "3.44", unit: "lb" },
    status: "pending",
    created: new Date("2027-07-11T10:20:00Z"),
    capturedAt: new Date("2027-07-11T10:02:00Z"),
    photos: [{}, {}],
    inBest: false,
  },
  {
    id: "sample-verified",
    species: "Largemouth bass",
    measurement: { value: "4.40", unit: "lb" },
    status: "verified",
    created: new Date("2027-07-10T11:42:00Z"),
    capturedAt: new Date("2027-07-10T10:58:00Z"),
    photos: [{}, {}, {}],
    inBest: true,
    decision: { by: "Judge", at: new Date("2027-07-10T13:14:00Z") },
  },
  {
    id: "sample-corrected",
    species: "Smallmouth bass",
    measurement: { value: "4.02", unit: "lb" },
    status: "verified",
    created: new Date("2027-07-09T21:15:00Z"),
    photos: [{}, {}, {}],
    reason: "Scale readout shows 4.02.",
    inBest: true,
    decision: { by: "Judge", at: new Date("2027-07-10T01:14:00Z") },
    correction: { change: "Weight 4.20 → 4.02 lb" },
  },
  {
    id: "sample-rejected",
    species: "Largemouth bass",
    measurement: { value: "3.20", unit: "lb" },
    status: "rejected",
    created: new Date("2027-07-09T00:02:00Z"),
    photos: [{}, {}],
    reason: "Readout not legible.",
    inBest: false,
    decision: { by: "Judge", at: new Date("2027-07-09T13:02:00Z") },
  },
  {
    id: "sample-retracted",
    species: "Smallmouth bass",
    measurement: { value: "2.80", unit: "lb" },
    status: "retracted",
    created: new Date("2027-07-08T23:30:00Z"),
    photos: [{}],
    inBest: false,
    retractedAt: new Date("2027-07-08T23:41:00Z"),
  },
  {
    id: "sample-verified-small",
    species: "Smallmouth bass",
    measurement: { value: "1.20", unit: "lb" },
    status: "verified",
    created: new Date("2027-07-06T13:44:00Z"),
    photos: [{}, {}],
    inBest: true,
    decision: { by: "Backup judge", at: new Date("2027-07-06T15:30:00Z") },
  },
];
