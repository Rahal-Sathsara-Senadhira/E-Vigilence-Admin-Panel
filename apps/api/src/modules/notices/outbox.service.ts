// Letters and SMS for addressees — docs/05 §5, docs/09 §5.4, N5.
//
// Until go-live nothing leaves the system (docs/15 D15-3): each message is
// held in `outbox_messages` and shown on the outbox screen. SMS never carries
// offence details (05 §5.1); every message uses one sender name and points
// only to the official payment page (N5).

import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { formatRupees, type OutboxMessageView } from "@ev/shared";
import type { ClientSession, Model, Types } from "mongoose";
import { OutboxMessage, type PenaltyNotice } from "./notice.schema";

export const SENDER = "Sri Lanka Police — E-Vigilance";
/** The official payment page. Configured per environment in a later phase; shown in letters and SMS. */
export const PAY_URL = process.env.PUBLIC_PAY_URL ?? "https://pay.evigilance.police.lk";

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Colombo",
});
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Colombo",
});
/** "4 November 2026" — the date style used in every letter. */
export const letterDate = (d: Date | null) => (d ? DATE.format(d) : "—");
const day = letterDate;

type NoticeLike = Pick<
  PenaltyNotice,
  | "noticeNumber"
  | "addresseeName"
  | "vehicleNumber"
  | "offenceDate"
  | "place"
  | "lines"
  | "amount"
  | "dueDate"
  | "serviceAddress"
  | "finalDueDate"
> & { _id: Types.ObjectId };

@Injectable()
export class OutboxService {
  constructor(@InjectModel(OutboxMessage.name) private readonly messages: Model<OutboxMessage>) {}

  private async hold(
    n: NoticeLike,
    channel: "post" | "sms",
    to: string,
    template: string,
    subject: string,
    body: string,
    session?: ClientSession,
  ) {
    await this.messages.create(
      [
        {
          channel,
          to,
          template,
          subject,
          body,
          noticeId: n._id,
          noticeNumber: n.noticeNumber,
          createdAt: new Date(),
          status: "held",
        },
      ],
      { session },
    );
  }

  /** The penalty notice itself (05 §5.2), and an SMS pointer when a phone is known. */
  async noticeLetter(n: NoticeLike, phone: string | null, session?: ClientSession) {
    const lines = n.lines
      .map((l) => `  • ${l.name} (${l.legalReference}) — ${formatRupees(l.fine)}`)
      .join("\n");
    const body = `${SENDER}
PENALTY NOTICE ${n.noticeNumber}

To: ${n.addresseeName}
${n.serviceAddress}

Vehicle: ${n.vehicleNumber ?? "—"}
Date and time: ${DATE_TIME.format(n.offenceDate)}
Place: ${n.place}

Offences:
${lines}

Amount due: ${formatRupees(n.amount)}
Pay or respond by: ${day(n.dueDate)}

How to pay: at ${PAY_URL} with the notice number and your ID number, or at a post office or bank.
If someone else was driving: name the driver once, by the due date, at ${PAY_URL}.
If you believe this notice is wrong: dispute it once, by the due date, at ${PAY_URL} or at the station.
If you do nothing, a reminder follows and then the matter goes to court.

Still images from the evidence are attached to the printed notice.`;
    await this.hold(
      n,
      "post",
      n.serviceAddress,
      "notice",
      `Penalty notice ${n.noticeNumber}`,
      body,
      session,
    );
    if (phone) {
      await this.hold(
        n,
        "sms",
        phone,
        "notice_sms",
        "Penalty notice posted",
        `${SENDER}: penalty notice ${n.noticeNumber} has been posted to you. Respond by ${day(n.dueDate)} at ${PAY_URL}.`,
        session,
      );
    }
  }

  async reminder(n: NoticeLike, phone: string | null, session?: ClientSession) {
    const body = `${SENDER}
REMINDER — PENALTY NOTICE ${n.noticeNumber}

To: ${n.addresseeName}
${n.serviceAddress}

We have not received payment or a response for this notice. Amount due: ${formatRupees(n.amount)}.
Final date: ${day(n.finalDueDate)}. After that the matter is referred to court.

Pay at ${PAY_URL}, or at a post office or bank.`;
    await this.hold(
      n,
      "post",
      n.serviceAddress,
      "reminder",
      `Reminder ${n.noticeNumber}`,
      body,
      session,
    );
    if (phone) {
      await this.hold(
        n,
        "sms",
        phone,
        "reminder_sms",
        "Reminder",
        `${SENDER}: reminder — notice ${n.noticeNumber} is unpaid. Final date ${day(n.finalDueDate)}. ${PAY_URL}`,
        session,
      );
    }
  }

  async letter(
    n: NoticeLike,
    template: string,
    subject: string,
    text: string,
    session?: ClientSession,
  ) {
    await this.hold(
      n,
      "post",
      n.serviceAddress,
      template,
      subject,
      `${SENDER}\n${subject.toUpperCase()} — ${n.noticeNumber}\n\nTo: ${n.addresseeName}\n${n.serviceAddress}\n\n${text}`,
      session,
    );
  }

  async receiptSms(
    n: NoticeLike,
    phone: string | null,
    reference: string,
    amount: number,
    session?: ClientSession,
  ) {
    if (!phone) return;
    await this.hold(
      n,
      "sms",
      phone,
      "receipt_sms",
      "Payment received",
      `${SENDER}: payment of ${formatRupees(amount)} received for notice ${n.noticeNumber}. Reference ${reference}. Thank you.`,
      session,
    );
  }

  async list(page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      this.messages
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.messages.countDocuments(),
    ]);
    return {
      items: rows.map((m): OutboxMessageView => ({
        id: String(m._id),
        channel: m.channel,
        to: m.to,
        template: m.template,
        subject: m.subject,
        body: m.body,
        noticeNumber: m.noticeNumber,
        createdAt: m.createdAt.toISOString(),
        status: "held",
      })),
      total,
      page,
      pageSize,
    };
  }
}
