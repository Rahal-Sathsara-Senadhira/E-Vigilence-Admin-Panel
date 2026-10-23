// English — the source text. Sinhala and Tamil must have the same keys
// (the type below makes a missing key a build error).

export const en = {
  app: {
    title: "Penalty notice",
    police: "Sri Lanka Police",
    language: "Language",
    official:
      "Official page. We never ask for your password or PIN, and we only send messages from {{sender}}.",
  },
  lookup: {
    heading: "Find your penalty notice",
    intro: "Enter the notice number and the ID number printed on the notice.",
    noticeNumber: "Notice number",
    noticeHint: "For example PN-2026-000318",
    idNumber: "ID number",
    idHint: "NIC, or business registration number for organisations",
    submit: "Find notice",
    privacy: "We show only what is on your notice. The name is partly hidden.",
  },
  notice: {
    addressee: "Addressee",
    vehicle: "Vehicle",
    offenceDate: "Date of offence",
    offences: "Offences",
    amount: "Amount due",
    dueDate: "Pay or respond by",
    status: "Status",
    another: "Look up another notice",
  },
  status: {
    issued: "Not yet posted",
    served: "Awaiting payment",
    nominated: "Driver named — under review",
    disputed: "Dispute under review",
    overdue: "Overdue",
    court_referral: "Referred to court",
    paid: "Paid",
    withdrawn: "Withdrawn",
    transferred: "Transferred to the driver",
    service_failed: "Contact the police station",
  },
  message: {
    issued: "This notice hasn't been posted yet. You can pay it once you receive it.",
    served: "",
    nominated: "We are reviewing the driver you named. We will write to you.",
    disputed: "We are reviewing your dispute. We will write to you with the result.",
    overdue: "The due date has passed. Pay by the date shown to avoid the matter going to court.",
    court_referral:
      "This notice has been referred to court. You can still pay until the case is filed.",
    paid: "This notice has been paid. Thank you.",
    withdrawn: "This notice has been withdrawn. You don't need to do anything.",
    transferred:
      "This notice was transferred to the driver you named. You don't need to do anything.",
    service_failed: "Please contact the police station shown on the notice.",
  },
  pay: {
    heading: "How to pay",
    offline: "Pay at any post office or bank with your notice number.",
    onlineSoon: "Online payment is not available on this page yet.",
  },
  respond: {
    heading: "Not the right notice for you?",
    nominate: "Someone else was driving",
    dispute: "I believe this notice is wrong",
  },
  nominate: {
    heading: "Name the driver",
    intro:
      "You can name the driver once, by the due date. If we accept it, a new notice goes to the driver and yours is closed.",
    driverName: "Driver's full name",
    driverId: "Driver's NIC or driving licence number",
    driverAddress: "Driver's postal address",
    driverPhone: "Driver's phone number (optional)",
    declaration:
      "I declare that the person named above was driving the vehicle at the time of the offence. I understand that giving false information is an offence.",
    submit: "Send",
    done: "Thank you. We will review the driver you named and write to you.",
  },
  dispute: {
    heading: "Dispute this notice",
    intro:
      "You can dispute this notice once. An officer reviews it and we write to you with the result.",
    ground: "Reason",
    grounds: {
      not_my_vehicle: "Not my vehicle, or the number plate is false",
      sold_or_stolen: "The vehicle was sold or stolen at the time",
      evidence_wrong: "The evidence is wrong",
      other: "Other",
    },
    explanation: "Explain what happened",
    explanationHint: "At least 20 characters. Keep any documents; the station may ask for them.",
    submit: "Send dispute",
    done: "Thank you. Your dispute has been received. We will write to you with the result.",
  },
  common: {
    cancel: "Cancel",
    back: "Back to the notice",
  },
  errors: {
    noticeNumber: "Enter the notice number, for example PN-2026-000318.",
    idNumber: "Enter the ID number printed on the notice.",
    driverName: "Enter the driver's full name.",
    driverId: "Enter the driver's NIC or driving licence number.",
    driverAddress: "Enter the driver's postal address.",
    declaration: "Tick the declaration to continue.",
    explanation: "Explain the dispute in at least 20 characters.",
    not_found: "No notice matches that number and ID number. Check both and try again.",
    rate_limited: "Too many attempts. Please wait 10 minutes and try again.",
    already_nominated: "A driver has already been named for this notice.",
    cannot_nominate: "A driver can't be named for this notice.",
    already_disputed: "This notice has already been disputed.",
    not_open: "This can no longer be done for this notice.",
    legacy_notice: "Please contact the police station about this notice.",
    validation: "Check the highlighted fields.",
    generic: "Something went wrong. Please try again.",
    network: "We couldn't reach the server. Check your connection and try again.",
  },
};

type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Messages = Shape<typeof en>;
