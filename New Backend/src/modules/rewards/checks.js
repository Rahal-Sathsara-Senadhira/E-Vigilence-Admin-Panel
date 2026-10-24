// Who may earn, and the fraud checks — docs/16 §3, §7. Each check gives the
// citizen a plain message and staff the real reason; the citizen never sees
// how something was detected.
//
// The app verifies phone and NIC and records the date of birth (docs/11 §6,
// D11-3); this system trusts those flags.

import mongoose from "mongoose";
import { normalizeNic, normalizePhone } from "#src/core/srilanka.js";
import { Person } from "../registers/registers.model.js";
import { Report } from "../reports/report.model.js";
import { ReporterAccount, flagReporter } from "../reporters/index.js";
import { User } from "../users/user.model.js";

const DAY = 86_400_000;
/** Sri Lanka is UTC+5:30, all year. */
const COLOMBO = 5.5 * 3_600_000;
/** §7 targeting: this many reports on one plate within the window. */
export const TARGETING_REPORTS = 3;
const TARGETING_DAYS = 90;

/**
 * @typedef {(
 *   | { result: "ok" }
 *   | { result: "not_eligible", message: string, staff: string }
 *   | { result: "held", staff: string }
 * )} Check
 */

export const MESSAGES = {
  notVerified: "Verify your phone and NIC in the app (18 or over) to earn rewards.",
  notEligible: "This report can't earn a reward.",
  dailyLimit: "Only the first reports you send each day can earn rewards.",
};

/** Old (9 digits + V) and new (12 digits) forms of one NIC. @param {unknown} input */
export function nicForms(input) {
  const nic = normalizeNic(input);
  if (!nic) return [];
  if (nic.length === 12) return [nic];
  const d = nic.slice(0, 9);
  return [nic, `19${d.slice(0, 5)}0${d.slice(5)}`];
}

/** The citizen's app account, as the checks need it. @param {string} userId @param {import("mongoose").ClientSession} session */
async function appUser(userId, session) {
  const db = mongoose.connection.db;
  if (!db || !mongoose.isValidObjectId(userId)) return null;
  const u = await db
    .collection("users")
    .findOne({ _id: new mongoose.Types.ObjectId(userId) }, { session });
  if (!u) return null;
  const born = u.dateOfBirth ? new Date(u.dateOfBirth) : null;
  return {
    verified: u.phoneVerified === true && u.nicVerified === true,
    adult: Boolean(born && !Number.isNaN(born.getTime()) && ageOn(born, new Date()) >= 18),
    nics: nicForms(u.nic ?? u.nicNumber ?? null),
    phone: normalizePhone(u.phone ?? u.phoneNumber ?? null),
    address: typeof u.address === "string" ? sameText(u.address) : null,
  };
}

/** Whole years. @param {Date} born @param {Date} on */
function ageOn(born, on) {
  let age = on.getFullYear() - born.getFullYear();
  const m = on.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < born.getDate())) age -= 1;
  return age;
}

/** Addresses compared without case, spaces or punctuation. @param {string} s */
const sameText = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "") || null;

/**
 * Whether a citizen report on a decided case can earn, should be held for
 * HQ, or can't earn — in the order of §3 then §7. A reporter who reported
 * their own vehicle is flagged too.
 * @param {import("mongoose").ClientSession} session
 * @param {any} c the case
 * @param {any} r the report
 * @param {{ dailyEarningReports: number }} rules
 * @returns {Promise<Check>}
 */
export async function checkReport(session, c, r, rules) {
  const userId = /** @type {string} */ (r.source.userId);
  const account = await ReporterAccount.findOne({ userId }, { status: 1, rewards: 1 }, { session });
  if (account?.rewards?.excluded)
    return {
      result: "not_eligible",
      message: MESSAGES.notEligible,
      staff: "Excluded from rewards",
    };

  const user = await appUser(userId, session);
  if (!user?.verified || !user.adult)
    return {
      result: "not_eligible",
      message: MESSAGES.notVerified,
      staff: "Phone or NIC not verified, or under 18",
    };
  if (user.phone && (await isStaffPhone(user.phone, session)))
    return {
      result: "not_eligible",
      message: MESSAGES.notEligible,
      staff: "Police staff (phone matches a staff account)",
    };

  // Self-reporting and collusion: the people the case is against.
  const ids = [c.owner?.id, c.driver?.id, c.decision?.outcome?.addresseePerson?.id].filter(Boolean);
  const people = ids.length
    ? await Person.find({ _id: { $in: ids } }, { nic: 1, phone: 1, address: 1 }, { session }).lean()
    : [];
  const self = people.some(
    (p) =>
      (p.nic && user.nics.some((n) => nicForms(p.nic).includes(n))) ||
      (p.phone && user.phone && normalizePhone(p.phone) === user.phone),
  );
  if (self) {
    await flagReporter(session, userId, "Reported a vehicle they own or drove", "Rewards check");
    return {
      result: "not_eligible",
      message: MESSAGES.notEligible,
      staff: "Self-report: the reporter is the owner or driver",
    };
  }

  // Only the first reports of the citizen's day (Sri Lanka time) can earn.
  const received = new Date(r.receivedAt).getTime();
  const dayStart = new Date(Math.floor((received + COLOMBO) / DAY) * DAY - COLOMBO);
  const earlier = await Report.countDocuments(
    {
      channel: "citizen_app",
      "source.userId": userId,
      receivedAt: { $gte: dayStart, $lt: r.receivedAt },
    },
    { session },
  );
  if (earlier >= rules.dailyEarningReports)
    return {
      result: "not_eligible",
      message: MESSAGES.dailyLimit,
      staff: `Over the daily limit (${rules.dailyEarningReports} earning reports)`,
    };

  if (account?.status === "suspended")
    return { result: "held", staff: "Account suspended — release if the suspension is lifted" };
  if (user.address && people.some((p) => p.address && sameText(p.address) === user.address))
    return { result: "held", staff: "Possible collusion: same address as the owner or driver" };
  if (r.vehicleNumber) {
    const onPlate = await Report.countDocuments(
      {
        channel: "citizen_app",
        "source.userId": userId,
        vehicleNumber: r.vehicleNumber,
        receivedAt: { $gte: new Date(received - TARGETING_DAYS * DAY), $lte: r.receivedAt },
      },
      { session },
    );
    if (onPlate >= TARGETING_REPORTS)
      return {
        result: "held",
        staff: `Possible targeting: ${onPlate} reports on ${r.vehicleNumber} in ${TARGETING_DAYS} days`,
      };
  }
  return { result: "ok" };
}

/** Staff phones are stored as typed: compare the national number. @param {string} phone @param {import("mongoose").ClientSession} session */
async function isStaffPhone(phone, session) {
  // The nine digits with any spacing between them, then compared exactly.
  const pattern = phone
    .slice(3)
    .split("")
    .join(String.raw`\D*`);
  const staff = await User.find(
    { isActive: true, phone: { $regex: `${pattern}$` } },
    { phone: 1 },
    { session },
  ).lean();
  return staff.some((s) => normalizePhone(s.phone) === phone);
}
