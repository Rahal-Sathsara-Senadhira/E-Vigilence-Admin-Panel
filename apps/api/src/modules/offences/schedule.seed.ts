// The first version of the offence schedule.
//
// Sources:
// - Spot fines: Extraordinary Gazette No. 2054/9 of 15 January 2018 (Motor
//   Traffic Act, spot-fine schedule), reported by Traffic Police HQ in June
//   2026 as still in force.
// - Court-only offences: Motor Traffic (Amendment) Act No. 10 of 2019.
// - Mobile phone use: s. 152A of the 2019 Act (spot fine Rs 10,000), which
//   replaced the gazette's Rs 1,000 under s. 154.
//
// TO BE CONFIRMED by HQ's legal officers before go-live (docs/08 §3: values
// to be confirmed). HQ edits create new versions; this file is only the start.
// Demerit points are left empty until the national scheme applies (docs/08).
//
// Severity drives the suggested priority (severe → P1, docs/02 §8) and the
// reward tier (docs/16 §5).

import type { OffenceOutcome, Severity, VehicleType } from "@ev/shared";

export interface SeedOffence {
  code: string;
  name: string;
  legalReference: string;
  outcome: OffenceOutcome;
  spotFine: number | null;
  severity: Severity;
  vehicleTypes: VehicleType[];
  citizenReportable: boolean;
  publicName: string;
  publicDescription: string;
}

export const SCHEDULE_SOURCE =
  "Gazette 2054/9 (15 Jan 2018); Motor Traffic (Amendment) Act No. 10 of 2019 — to be confirmed by HQ legal";

const spot = (
  code: string,
  name: string,
  legalReference: string,
  spotFine: number,
  severity: Severity,
  citizenReportable: boolean,
  publicName: string,
  publicDescription: string,
  vehicleTypes: VehicleType[] = [],
): SeedOffence => ({
  code,
  name,
  legalReference,
  outcome: "spot_fine",
  spotFine,
  severity,
  vehicleTypes,
  citizenReportable,
  publicName,
  publicDescription,
});

const court = (
  code: string,
  name: string,
  legalReference: string,
  citizenReportable: boolean,
  publicName: string,
  publicDescription: string,
  vehicleTypes: VehicleType[] = [],
): SeedOffence => ({
  code,
  name,
  legalReference,
  outcome: "court",
  spotFine: null,
  severity: "severe",
  vehicleTypes,
  citizenReportable,
  publicName,
  publicDescription,
});

export const SEED_OFFENCES: SeedOffence[] = [
  // Gazette 2054/9 — visible on the road, so citizens can report them
  spot(
    "MTA-21",
    "Identification marks not displayed or maintained",
    "MTA ss. 21–23, 73, 74(1)",
    1_000,
    "minor",
    true,
    "Number plate missing or unreadable",
    "The vehicle has no number plate, or it is covered, damaged or unreadable.",
  ),
  spot(
    "MTA-148",
    "Non-compliance with the rules of the road",
    "MTA s. 148",
    2_000,
    "moderate",
    true,
    "Breaking the rules of the road",
    "Driving on the wrong side, overtaking across a double line, or other rule-of-the-road offences.",
  ),
  spot(
    "MTA-152",
    "Driving without proper control of the vehicle",
    "MTA s. 152",
    1_000,
    "moderate",
    true,
    "Careless driving",
    "Driving without proper control — weaving, cutting in, or driving carelessly.",
  ),
  spot(
    "MTA-153",
    "Failing to keep a safe road position",
    "MTA s. 153",
    1_000,
    "minor",
    true,
    "Unsafe lane position",
    "Not keeping to the correct lane or a safe position on the road.",
  ),
  spot(
    "MTA-152A",
    "Using a mobile phone or other device while driving",
    "MTA s. 152A (Act No. 10 of 2019)",
    10_000,
    "moderate",
    true,
    "Using a phone while driving",
    "The driver is holding or using a mobile phone while the vehicle is moving.",
  ),
  spot(
    "MTA-155",
    "Improper or excessive use of horn",
    "MTA s. 155",
    1_000,
    "minor",
    true,
    "Excessive horn use",
    "Sounding the horn unnecessarily or for a long time.",
  ),
  spot(
    "MTA-155A",
    "Emission control regulations violated",
    "MTA s. 155A",
    1_000,
    "minor",
    true,
    "Heavy smoke from vehicle",
    "The vehicle is giving out thick black or white smoke.",
  ),
  spot(
    "MTA-157",
    "Exceeding permitted front seating",
    "MTA s. 157",
    1_000,
    "minor",
    true,
    "Too many people in front",
    "More people in the front seat than the vehicle allows.",
  ),
  spot(
    "MTA-157A",
    "Seat belt not worn",
    "MTA s. 157A",
    1_000,
    "minor",
    true,
    "No seat belt",
    "The driver or front passenger is not wearing a seat belt.",
  ),
  spot(
    "MTA-158",
    "Riding a motorcycle without a protective helmet",
    "MTA s. 158",
    1_000,
    "minor",
    true,
    "No helmet",
    "The rider or pillion passenger of a motorcycle is not wearing a helmet.",
    ["motorcycle"],
  ),
  spot(
    "MTA-159",
    "Clinging to a moving vehicle",
    "MTA s. 159",
    1_000,
    "minor",
    true,
    "Riding on the footboard",
    "People are hanging on to the outside or footboard of a moving vehicle.",
    ["bus", "lorry", "tractor"],
  ),
  spot(
    "MTA-160",
    "Excessive or prohibited noise",
    "MTA s. 160",
    1_000,
    "minor",
    true,
    "Loud or modified silencer",
    "The vehicle makes excessive noise, for example from a modified silencer.",
  ),
  spot(
    "MTA-164",
    "Failing to obey road signs or traffic lights",
    "MTA s. 164",
    1_000,
    "moderate",
    true,
    "Ignoring a red light or road sign",
    "Going through a red light, or ignoring a stop, no-entry or other road sign.",
  ),
  spot(
    "MTA-166",
    "Unlawful parking or stopping",
    "MTA s. 166",
    1_000,
    "minor",
    true,
    "Illegal parking",
    "Parked or stopped where it is not allowed, such as on a pedestrian crossing or a bend.",
  ),
  spot(
    "MTA-167",
    "No safety precautions for a broken-down vehicle",
    "MTA s. 167",
    2_000,
    "minor",
    true,
    "Broken-down vehicle left unsafe",
    "A broken-down or unattended vehicle is left without warning signs or lights.",
  ),
  spot(
    "MTA-178",
    "Exceeding certified passenger or goods capacity",
    "MTA s. 178",
    500,
    "minor",
    true,
    "Overloaded vehicle",
    "The vehicle is carrying more passengers or goods than it is allowed to.",
  ),
  spot(
    "MTA-179",
    "Exceeding omnibus capacity",
    "MTA s. 179",
    500,
    "minor",
    true,
    "Overcrowded bus",
    "The bus is carrying more passengers than it is allowed to.",
    ["bus"],
  ),
  spot(
    "MTA-188",
    "Lorry overloaded beyond permissible weight",
    "MTA s. 188",
    500,
    "minor",
    true,
    "Overloaded lorry",
    "The lorry is carrying a load heavier or larger than permitted.",
    ["lorry"],
  ),
  spot(
    "MTA-140",
    "Exceeding the speed limit",
    "MTA ss. 140, 141",
    3_000,
    "moderate",
    false,
    "Speeding",
    "Driving faster than the speed limit.",
  ),

  // Gazette 2054/9 — checked by officers, not reported by the public
  spot(
    "MTA-38",
    "Revenue licence not displayed or produced",
    "MTA s. 38",
    1_000,
    "minor",
    false,
    "No revenue licence",
    "The vehicle's revenue licence is missing or expired.",
  ),
  spot(
    "MTA-130",
    "Driving without a licence for the vehicle class",
    "MTA s. 130",
    1_000,
    "moderate",
    false,
    "No licence for the vehicle class",
    "The driver has no licence valid for this kind of vehicle.",
  ),
  spot(
    "MTA-135",
    "Driving licence not carried",
    "MTA s. 135",
    1_000,
    "minor",
    false,
    "Licence not carried",
    "The driver isn't carrying their driving licence.",
  ),
  spot(
    "MTA-162",
    "Disregarding a police officer's directions",
    "MTA s. 162",
    2_000,
    "moderate",
    false,
    "Ignoring police directions",
    "Not following a police officer's lawful directions.",
  ),
  spot(
    "MTA-196E",
    "No valid emission test or fitness certificate",
    "MTA s. 196 (Gazette 2054/9)",
    500,
    "minor",
    false,
    "No emission or fitness certificate",
    "The vehicle has no valid emission test or fitness certificate.",
  ),

  // Act No. 10 of 2019 — court only, severe (P1)
  court(
    "MTA-216",
    "Driving under the influence of alcohol or drugs",
    "MTA s. 216 (Act No. 10 of 2019)",
    true,
    "Suspected drunk or drugged driving",
    "The driver appears to be under the influence of alcohol or drugs. If someone is in danger, call 119 now.",
  ),
  court(
    "MTA-148A",
    "Hazardous driving at a railway crossing",
    "MTA s. 148A (Act No. 10 of 2019)",
    true,
    "Dangerous railway crossing",
    "Crossing or stopping on a railway line when it is unsafe, or ignoring crossing signals.",
  ),
  court(
    "MTA-217",
    "Reckless or negligent driving",
    "MTA s. 217 (Act No. 10 of 2019)",
    true,
    "Reckless driving",
    "Driving dangerously or recklessly, putting other people at risk.",
  ),
  court(
    "MTA-218",
    "Permitting a minor to drive",
    "MTA s. 218 (Act No. 10 of 2019)",
    true,
    "Underage driver",
    "The driver appears to be under the legal driving age.",
  ),
  court(
    "MTA-123",
    "Driving without a valid driving licence",
    "MTA s. 123 (Act No. 10 of 2019)",
    false,
    "No driving licence",
    "The driver has no valid driving licence.",
  ),
  court(
    "MTA-196",
    "No valid third-party insurance",
    "MTA s. 196 (Act No. 10 of 2019)",
    false,
    "No insurance",
    "The vehicle has no valid third-party insurance.",
  ),
];
