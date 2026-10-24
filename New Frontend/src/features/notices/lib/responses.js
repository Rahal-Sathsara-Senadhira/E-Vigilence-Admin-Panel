// Starting values for the addressee's responses, and the shape the API expects.

/** @typedef {{ name: string, nic: string, licenceNumber: string, address: string, phone: string }} DriverValue */
/** @typedef {{ grounds: string, explanation: string }} DisputeValue */

/** @type {DriverValue} */
export const EMPTY_DRIVER = { name: "", nic: "", licenceNumber: "", address: "", phone: "" };
/** @type {DisputeValue} */
export const EMPTY_DISPUTE = { grounds: "", explanation: "" };

/** Only the filled-in fields, as the API expects. @param {DriverValue} d */
export const driverBody = (d) =>
  /** @type {Record<string, string>} */ (
    Object.fromEntries(Object.entries(d).filter(([, v]) => v.trim() !== ""))
  );
